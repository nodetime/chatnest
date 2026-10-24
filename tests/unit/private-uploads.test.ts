import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG90AAAAASUVORK5CYII=",
  "base64"
);
test("only bounded valid image bytes are registered, MIME is sniffed and display names retain Unicode", async () => {
  const { validateImage, safeDisplayName, MAX_FILE_BYTES } = await import(
    "@/server/uploads/validation"
  );
  assert.equal(await validateImage(png, "image/png"), "image/png");
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.from("<svg/>"),
    png.subarray(0, 30),
    Buffer.alloc(MAX_FILE_BYTES + 1),
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: Bounded sequential I/O prevents concurrent memory and transaction pressure.
    await assert.rejects(() => validateImage(bytes, "image/png"));
  }
  await assert.rejects(() => validateImage(png, "image/jpeg"));
  assert.equal(safeDisplayName("../../图片\r\n.png"), "图片.png");
});
test("canonical asset refs allow basePath only and never external/path/query/data URLs", async () => {
  const { assetIdFromRef } = await import("@/server/uploads/refs");
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(assetIdFromRef(`/api/files/${id}`, ""), id);
  assert.equal(assetIdFromRef(`/demo/api/files/${id}`, "/demo"), id);
  for (const ref of [
    `https://example.org/api/files/${id}`,
    `/api/files/${id}?x=1`,
    `/api/files/../${id}`,
    "data:image/png;base64,x",
    `/demo/api/files/${id}`,
  ]) {
    assert.throws(() => assetIdFromRef(ref, ""));
  }
});
test("private driver preserves bytes and rejects symlinks/path locators with private permissions", async () => {
  const { LocalUploadStore } = await import("@/server/uploads/local-store");
  const root = await realpath(await mkdtemp(join(tmpdir(), "private-upload-")));
  try {
    const store = new LocalUploadStore(root);
    const id = "11111111-1111-4111-8111-111111111111";
    await store.write(id, png);
    assert.deepEqual(await store.read(id, png.length), png);
    assert.equal((await stat(join(root, id))).mode & 0o777, 0o600);
    await assert.rejects(() => store.write("../oops", png));
    await assert.rejects(() => store.read(id, 1));
    await store.delete(id);
    await assert.rejects(() => readFile(join(root, id)));
    await symlink("/etc/passwd", join(root, id));
    await assert.rejects(() => store.read(id, 1024 * 1024));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
test("production requires explicit absolute persistent directory and quota bounds are finite", async () => {
  const { storageDirectory, quotaLimits } = await import(
    "@/server/uploads/local-store"
  );
  assert.throws(() => storageDirectory({ NODE_ENV: "production" }));
  assert.throws(() =>
    storageDirectory({ NODE_ENV: "production", UPLOAD_STORAGE_DIR: "relative" })
  );
  assert.equal(
    storageDirectory({
      NODE_ENV: "production",
      UPLOAD_STORAGE_DIR: "/srv/private",
    }),
    "/srv/private"
  );
  assert.throws(() => quotaLimits({ UPLOAD_USER_QUOTA_BYTES: "NaN" }));
  assert.equal(quotaLimits({}).user, 100 * 1024 * 1024);
});
test("Vercel Functions cannot claim local upload durability even with a writable scratch directory", async () => {
  const { storageDirectory } = await import("@/server/uploads/local-store");
  for (const directory of ["/tmp/private-uploads", "/srv/private"]) {
    assert.throws(
      () =>
        storageDirectory({
          NODE_ENV: "production",
          UPLOAD_STORAGE_DIR: directory,
          VERCEL: "1",
        }),
      (error: unknown) =>
        error instanceof Error &&
        "status" in error &&
        error.status === 503 &&
        /Vercel Functions/.test(error.message)
    );
  }
  assert.equal(
    storageDirectory({
      NODE_ENV: "production",
      UPLOAD_STORAGE_DIR: "/srv/private",
      VERCEL: "0",
    }),
    "/srv/private"
  );
});
test("multipart input is stream bounded before parsing and rejects duplicate file/chat fields", async () => {
  const { readUploadForm, MAX_REQUEST_BYTES } = await import(
    "@/server/uploads/validation"
  );
  const form = new FormData();
  form.append("file", new File([png], "图片.png", { type: "image/png" }));
  form.append("chatId", "11111111-1111-4111-8111-111111111111");
  const parsed = await readUploadForm(
    new Request("http://localhost", { body: form, method: "POST" })
  );
  assert.equal(parsed.file.name, "图片.png");
  form.append("file", new File([png], "x.png", { type: "image/png" }));
  await assert.rejects(() =>
    readUploadForm(
      new Request("http://localhost", { body: form, method: "POST" })
    )
  );
  await assert.rejects(() =>
    readUploadForm(
      new Request("http://localhost", {
        body: Buffer.alloc(MAX_REQUEST_BYTES + 1),
        method: "POST",
      })
    )
  );
});
test("generation admission is synchronous, A B A invalidates stale completions and cancellation", async () => {
  const { UploadAdmission } = await import("@/server/uploads/client-admission");
  const gate = new UploadAdmission("A");
  const first = gate.admit(14, 1);
  assert.ok(first);
  assert.equal(gate.admit(14, 1), null);
  gate.switchChat("B");
  gate.switchChat("A");
  assert.equal(gate.isCurrent(first), false);
  assert.equal(first.controller.signal.aborted, true);
  const next = gate.admit(0, 15);
  assert.ok(next);
  assert.equal(gate.pending, 15);
  gate.finish(first);
  assert.equal(gate.pending, 15);
  gate.finish(next);
  assert.equal(gate.pending, 0);
});
test("attachment preparation rejects vision/count/history budget/external refs before reading bytes", async () => {
  const { prepareAttachmentContext } = await import("@/server/uploads/context");
  const ref = "/api/files/11111111-1111-4111-8111-111111111111";
  let reads = 0;
  // biome-ignore lint/suspicious/useAwait: The injected asynchronous API deliberately resolves without real I/O in this offline test.
  const resolve = async () => {
    reads += 1;
    return {
      bytes: png,
      mime: "image/png",
      name: "图片.png",
      size: png.length,
    };
  };
  const message = {
    id: "m",
    parts: [{ mediaType: "image/png", type: "file" as const, url: ref }],
    role: "user" as const,
  };
  await assert.rejects(
    () => prepareAttachmentContext([message], false, resolve),
    /图片/
  );
  assert.equal(reads, 0);
  await assert.rejects(
    () =>
      prepareAttachmentContext(
        [{ ...message, parts: new Array(16).fill(message.parts[0]) }],
        true,
        resolve
      ),
    /15/
  );
  assert.equal(reads, 0);
  await assert.rejects(
    () =>
      prepareAttachmentContext(
        [
          {
            ...message,
            parts: [{ ...message.parts[0], url: "https://example.org/x.png" }],
          },
        ],
        true,
        resolve
      ),
    /重新上传/
  );
  assert.equal(reads, 0);
  const output = await prepareAttachmentContext([message], true, resolve);
  assert.match(
    (output[0].parts[0] as { url: string }).url,
    /^data:image\/png;base64,/
  );
  assert.equal(message.parts[0].url, ref);
  await assert.rejects(
    () =>
      prepareAttachmentContext(new Array(5).fill(message), true, async () => ({
        bytes: Buffer.alloc(5 * 1024 ** 2),
        mime: "image/png",
        name: "x",
        size: 5 * 1024 ** 2,
      })),
    /20 MiB/
  );
});
test("drafts are owner-only and used public reads require real committed association", async () => {
  const { mayReadAsset, authorizeUploadRequest } = await import(
    "@/server/uploads/security"
  );
  const asset = {
    associated: false,
    chatOwnerId: null,
    ownerId: "owner",
    state: "draft",
    visibility: null,
  };
  assert.equal(mayReadAsset(asset, "owner"), true);
  assert.equal(mayReadAsset(asset, "other"), false);
  const used = {
    ...asset,
    chatOwnerId: "owner",
    state: "used",
    visibility: "public",
  };
  assert.equal(mayReadAsset(used, "other"), false);
  assert.equal(mayReadAsset({ ...used, associated: true }, "other"), true);
  assert.equal(
    mayReadAsset({ ...used, associated: true, visibility: "private" }, "other"),
    false
  );
  assert.equal(mayReadAsset({ ...used, chatOwnerId: "other" }, "owner"), false);
  assert.throws(() =>
    authorizeUploadRequest(
      { id: "owner", type: "guest" },
      new Request("http://localhost", {
        headers: { Origin: "http://localhost" },
      }),
      true
    )
  );
  assert.throws(() =>
    authorizeUploadRequest(
      { id: "owner", type: "regular" },
      new Request("http://localhost", {
        headers: { Origin: "http://evil.test" },
      }),
      true
    )
  );
});
test("upload routes and chat entry wire private lifecycle before persistence/title/model, without optimizing previews", async () => {
  const { readFile: readSource } = await import("node:fs/promises");
  const route = await readSource("app/(chat)/api/chat/route.ts", "utf8");
  assert.ok(
    route.includes("prepareAttachmentContext"),
    "chat resolves registered private assets"
  );
  assert.ok(
    route.indexOf("await prepareAttachmentContext") <
      route.indexOf("await commitUserMessage"),
    "validate before commit"
  );
  assert.ok(
    route.indexOf("await prepareAttachmentContext") <
      route.indexOf("titlePromise = generateTitleFromUserMessage"),
    "validate before title"
  );
  assert.ok(
    route.includes("convertToModelMessages(attachmentContext"),
    "model receives resolved inline bytes"
  );
  const preview = await readFile(
    "components/chat/preview-attachment.tsx",
    "utf8"
  );
  assert.ok(!preview.includes("next/image"));
  const upload = await readSource(
    "app/(chat)/api/files/upload/route.ts",
    "utf8"
  );
  assert.ok(upload.includes("readUploadForm"));
  assert.ok(!upload.includes("@vercel/blob"));
});
test("public guest readers are accepted but writes remain regular-only and used orphan owner reads fail closed", async () => {
  const { mayReadAsset, authorizeUploadRequest } = await import(
    "@/server/uploads/security"
  );
  const request = new Request("http://localhost", {
    headers: { Origin: "http://localhost" },
  });
  assert.equal(
    authorizeUploadRequest({ id: "guest", type: "guest" }, request, false),
    "guest"
  );
  assert.throws(() =>
    authorizeUploadRequest({ id: "guest", type: "guest" }, request, true)
  );
  assert.equal(
    mayReadAsset(
      {
        associated: false,
        chatOwnerId: null,
        ownerId: "owner",
        state: "used",
        visibility: null,
      },
      "owner"
    ),
    false
  );
  assert.equal(
    mayReadAsset(
      {
        associated: false,
        chatOwnerId: "owner",
        ownerId: "owner",
        state: "used",
        visibility: "public",
      },
      "owner"
    ),
    false
  );
});
test("SDK-swallowed send errors never clear draft, successful submissions clear only their own generation", async () => {
  const { completeDraftSubmission } = await import(
    "@/server/uploads/client-admission"
  );
  let clears = 0;
  const failed = new Error("vision rejected");
  await assert.rejects(
    () =>
      completeDraftSubmission(
        async () => undefined,
        () => failed,
        () => true,
        () => {
          clears += 1;
        }
      ),
    /vision rejected/
  );
  assert.equal(clears, 0);
  await completeDraftSubmission(
    async () => undefined,
    () => undefined,
    () => false,
    () => {
      clears += 1;
    }
  );
  assert.equal(clears, 0);
  await completeDraftSubmission(
    async () => undefined,
    () => undefined,
    () => true,
    () => {
      clears += 1;
    }
  );
  assert.equal(clears, 1);
});
test("process upload admission rejects excess requests without reading their bodies and releases on failure", async () => {
  const { UploadCapacity } = await import("@/server/uploads/capacity");
  const gate = new UploadCapacity(1);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = gate.run(() => hold);
  let ran = false;
  await assert.rejects(
    () =>
      // biome-ignore lint/suspicious/useAwait: The injected asynchronous API deliberately resolves without real I/O in this offline test.
      gate.run(async () => {
        ran = true;
      }),
    /繁忙/
  );
  assert.equal(ran, false);
  release();
  await first;
  await assert.rejects(
    () =>
      // biome-ignore lint/suspicious/useAwait: The injected asynchronous API deliberately resolves without real I/O in this offline test.
      gate.run(async () => {
        throw new Error("failure");
      }),
    /failure/
  );
  assert.equal(await gate.run(async () => 42), 42);
});
test("admin navigation marks only the actual storage route active and exposes real storage controls", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  assert.ok(
    existsSync("components/admin/admin-navigation.tsx"),
    "route-aware admin navigation exists"
  );
  const source = readFileSync("components/admin/admin-navigation.tsx", "utf8");
  assert.match(source, /usePathname/);
  assert.match(source, /aria-current/);
  const { execFileSync } = await import("node:child_process");
  const html = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {AdminNavigationItems}=require('./components/admin/admin-navigation');const {SidebarProvider}=require('./components/ui/sidebar');const {TooltipProvider}=require('./components/ui/tooltip');console.log(renderToStaticMarkup(React.createElement(TooltipProvider,null,React.createElement(SidebarProvider,null,React.createElement(AdminNavigationItems,{pathname:'/demo/admin/storage'})))));`,
    ],
    { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } }
  );
  assert.match(
    html,
    /href="\/admin\/storage"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/admin\/storage"/
  );
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  const ui = readFileSync("components/admin/admin-storage.tsx", "utf8");
  for (const action of ["test", "configure", "cleanup"]) {
    assert.ok(ui.includes(`'${action}'`) || ui.includes(`"${action}"`));
  }
  assert.match(ui, /<details/);
});
test("blank storage environment never writes UUID files into the repository", async () => {
  const { storageDirectory } = await import("@/server/uploads/local-store");
  const { resolve } = await import("node:path");
  assert.equal(
    storageDirectory({ NODE_ENV: "development", UPLOAD_STORAGE_DIR: "" }),
    resolve(".data/private-uploads")
  );
  assert.equal(
    storageDirectory({ NODE_ENV: "development", UPLOAD_STORAGE_DIR: "  " }),
    resolve(".data/private-uploads")
  );
  assert.throws(() =>
    storageDirectory({ NODE_ENV: "production", UPLOAD_STORAGE_DIR: " " })
  );
});
test("missing finalized pending reservation is a conflict rather than a successful orphan URL", async () => {
  const { requireFinalizedUpload } = await import("@/server/uploads/security");
  assert.throws(() => requireFinalizedUpload([]), /失效/);
  assert.doesNotThrow(() => requireFinalizedUpload([{ id: "asset" }]));
});
test("client editing never deletes persisted history and rolls back SDK-swallowed validation errors", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("components/chat/message-editor.tsx", "utf8");
  assert.ok(!source.includes("deleteTrailingMessages"));
  const composer = readFileSync("components/chat/multimodal-input.tsx", "utf8");
  assert.match(composer, /原图片保留，编辑时只修改文字/);
  assert.match(composer, /disabled=\{Boolean\(editingMessage\)\}/);
  const { submitEditedMessage } = await import(
    "@/app/_components/chat/message-editor"
  );
  const message = {
    id: "u",
    parts: [{ text: "original", type: "text" as const }],
    role: "user" as const,
  };
  const snapshot = [message];
  let current = snapshot;
  await assert.rejects(
    () =>
      submitEditedMessage({
        getSendError: () => new Error("vision"),
        isCurrent: () => true,
        message,
        regenerate: async () => undefined,
        setInput: () => undefined,
        setMessages: ((
          value: typeof snapshot | ((old: typeof snapshot) => typeof snapshot)
        ) => {
          current = typeof value === "function" ? value(current) : value;
        }) as never,
        snapshot,
        text: "edited",
      }),
    /vision/
  );
  assert.deepEqual(current, snapshot);
});
test("chat authenticates and bounds the stream before parsing JSON, including approval payloads", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("app/(chat)/api/chat/route.ts", "utf8");
  assert.ok(!source.includes("request.json()"));
  assert.ok(
    source.indexOf("await auth()") < source.indexOf("await readBoundedBody")
  );
  assert.match(source, /MAX_CHAT_REQUEST_BYTES/);
});
test("decoder saturation reports busy rather than falsely labelling valid image bytes corrupt", async () => {
  const { decodeCapacity } = await import("@/server/uploads/capacity");
  const { validateImage, UploadError } = await import(
    "@/server/uploads/validation"
  );
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = decodeCapacity.run(() => hold),
    second = decodeCapacity.run(() => hold);
  try {
    await assert.rejects(
      () => validateImage(png, "image/png"),
      (error) =>
        error instanceof UploadError &&
        error.status === 429 &&
        error.message.includes("繁忙")
    );
  } finally {
    release();
    await Promise.all([first, second]);
  }
});
test("completed user markdown renders statically instead of reusing streaming block cache after edits", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("components/chat/message.tsx", "utf8");
  assert.match(
    source,
    /<MessageResponse\s+mode=\{isUser\s*\?\s*"static"\s*:\s*"streaming"\}/
  );
});
test("successful pending edit clears only submitted text and preserves newly typed draft", async () => {
  const { submitEditedMessage } = await import(
    "@/app/_components/chat/message-editor"
  );
  const message = {
    id: "u",
    parts: [{ text: "original", type: "text" as const }],
    role: "user" as const,
  };
  let draft = "submitted edit";
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = submitEditedMessage({
    getSendError: () => undefined,
    isCurrent: () => true,
    message,
    regenerate: () => hold,
    setInput: (update) => {
      draft = typeof update === "function" ? update(draft) : update;
    },
    setMessages: () => undefined,
    snapshot: [message],
    text: draft,
  });
  draft = "new next draft";
  release();
  await pending;
  assert.equal(draft, "new next draft");
  // Verify that an unchanged submitted draft is still cleared.
  draft = "submitted edit";
  await submitEditedMessage({
    getSendError: () => undefined,
    isCurrent: () => true,
    message,
    regenerate: async () => undefined,
    setInput: (update) => {
      draft = typeof update === "function" ? update(draft) : update;
    },
    setMessages: () => undefined,
    snapshot: [message],
    text: draft,
  });
  assert.equal(draft, "");
});
test("valid APNG acTL chunks are rejected even when decoder metadata omits pages", async () => {
  const { validateImage } = await import("@/server/uploads/validation");
  const apng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAABAAAAAQAAAAAAAAAAAAEAAQAAVirfMQAAAA1JREFUeJxj+M/A8B8ABQAB/4mZPR0AAAAaZmNUTAAAAAEAAAABAAAAAQAAAAAAAAAAAAEAAQAAzVk15QAAABFmZEFUAAAAAnicY2D4z/AfAAQBAf9i5+mcAAAAAElFTkSuQmCC",
    "base64"
  );
  await assert.rejects(() => validateImage(apng, "image/png"), /静态|动画/);
  // A valid ancillary text chunk containing the same letters is not animation.
  const data = Buffer.from("fixture\0acTL"),
    type = Buffer.from("tEXt"),
    chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  type.copy(chunk, 4);
  data.copy(chunk, 8);
  let crc = 0xff_ff_ff_ff;
  for (const byte of Buffer.concat([type, data])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xed_b8_83_20 : 0);
    }
  }
  chunk.writeUInt32BE((crc ^ 0xff_ff_ff_ff) >>> 0, data.length + 8);
  const staticPng = Buffer.concat([
    png.subarray(0, 33),
    chunk,
    png.subarray(33),
  ]);
  assert.equal(await validateImage(staticPng, "image/png"), "image/png");
  const malformed = Buffer.from(png);
  malformed.writeUInt32BE(0x7f_ff_ff_ff, 8);
  await assert.rejects(() => validateImage(malformed, "image/png"));
});

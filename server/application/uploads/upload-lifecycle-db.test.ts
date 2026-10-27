import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

// Explicit local-only opt-in; ordinary offline/CI runs never open a database.
const enabled = process.env.CHATNEST_UPLOAD_LIFECYCLE_DB === "1";
const child = process.env.CHATNEST_UPLOAD_LIFECYCLE_CHILD === "1";

async function lifecycle() {
  const connection = process.env.POSTGRES_URL ?? "";
  const destination = process.env.UPLOAD_STORAGE_DIR ?? "";
  const target = new URL(connection);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname));
  assert.ok(
    isAbsolute(destination),
    "use an explicit absolute private storage directory"
  );
  const sql = postgres(connection, { max: 1 });
  const owner = randomUUID();
  const stranger = randomUUID();
  const freshChat = randomUUID();
  const existingChat = randomUUID();
  const foreignChat = randomUUID();
  const chatIds = [freshChat, existingChat, foreignChat];
  const userIds = [owner, stranger];
  const bytes = Buffer.from(
    "Local upload lifecycle: source_field remains unchanged.\n原始附件内容"
  );
  const file = () => new File([bytes], "lifecycle.txt", { type: "text/plain" });
  const status = (expected: number) => (error: unknown) => {
    assert.equal((error as { status?: number }).status, expected);
    return true;
  };
  try {
    const [settings] =
      await sql`SELECT enabled FROM upload_settings WHERE id='workspace'`;
    assert.equal(
      settings?.enabled,
      true,
      "dedicated local database must already enable uploads"
    );
    // registerUpload performs bounded expiration maintenance. Refuse to run if
    // another fixture could be swept rather than changing its records.
    const [expired] =
      await sql`SELECT count(*)::int AS count FROM upload_assets WHERE (state IN ('draft','pending') AND created_at<now()-interval '24 hours') OR state='deleting'`;
    assert.equal(
      expired.count,
      0,
      "leave unrelated expired fixtures untouched"
    );
    await sql`INSERT INTO users (id,email) VALUES (${owner},${`upload-${owner}@example.invalid`}),(${stranger},${`upload-${stranger}@example.invalid`})`;
    await sql`INSERT INTO chats (id,created_at,title,user_id,visibility) VALUES (${existingChat},now(),'upload lifecycle owner',${owner},'private'),(${foreignChat},now(),'upload lifecycle stranger',${stranger},'private')`;
    const service = await import("./service");
    const uploaded = await service.registerUpload(owner, freshChat, file());
    assert.equal(uploaded.extraction?.status, "ready");
    const id = uploaded.pathname;
    const [registered] = await sql`SELECT * FROM upload_assets WHERE id=${id}`;
    assert.equal(registered.owner_id, owner);
    assert.equal(registered.chat_id, freshChat);
    assert.ok(registered.derived_bytes > 0);
    assert.equal(registered.state, "draft");

    // This is the browser-reported regression: upload succeeds, then owner read
    // fails because SELECT a.* did not map owner_id/chat_id to the domain keys.
    const readable = await service.readAsset(id, owner, freshChat);
    assert.deepEqual(readable.bytes, bytes);
    const context = await service.readAssetForContext(id, owner, freshChat);
    assert.equal(context.extraction?.status, "ready");
    assert.match(context.extraction?.segments[0].text ?? "", /source_field/);
    await assert.rejects(
      service.readAsset(id, stranger, freshChat),
      status(404)
    );
    await assert.rejects(
      service.readAsset(id, owner, existingChat),
      status(404)
    );
    await assert.rejects(
      service.readAttachmentAsset(id, owner, freshChat),
      status(404)
    );
    await assert.rejects(service.deleteDraft(id, stranger), status(404));
    await assert.rejects(
      service.registerUpload(stranger, existingChat, file()),
      status(403)
    );
    await assert.rejects(
      service.registerUpload(owner, foreignChat, file()),
      status(403)
    );

    const extraction = {
      ...registered.extraction,
      source_field: {
        nested_key: "original_value",
        owner_id: "payload-not-column",
      },
    };
    await sql`UPDATE upload_assets SET extraction=${sql.json(extraction)} WHERE id=${id}`;
    assert.deepEqual(
      (await service.readAsset(id, owner, freshChat)).extraction,
      extraction,
      "column conversion must not recursively camel-case user JSON"
    );
    const parts = [
      {
        custom_meta: { source_field: "keep_me" },
        text: "Read the uploaded document",
        type: "text",
      },
      {
        filename: uploaded.name,
        mediaType: uploaded.contentType,
        type: "file",
        url: uploaded.url,
      },
    ];
    const message = () => ({
      attachments: [],
      chatId: freshChat,
      createdAt: new Date(),
      id: randomUUID(),
      parts,
      role: "user",
    });
    await service.commitUserMessage({
      chatId: freshChat,
      message: message(),
      ownerId: owner,
      visibility: "private",
    });
    const [pinned] = await sql`SELECT state FROM upload_assets WHERE id=${id}`;
    assert.equal(pinned.state, "used");
    const [stored] =
      await sql`SELECT parts FROM messages WHERE chat_id=${freshChat}`;
    assert.deepEqual(
      stored.parts,
      parts,
      "message JSON retains its original nested field names"
    );
    assert.deepEqual(
      (await service.readAttachmentAsset(id, owner, freshChat)).extraction,
      extraction
    );
    await assert.rejects(
      service.readAttachmentAsset(id, stranger, freshChat),
      status(404)
    );
    await assert.rejects(
      service.readAttachmentAsset(id, owner, existingChat),
      status(404)
    );
    await assert.rejects(service.deleteDraft(id, owner), status(409));
    // Existing chat ownership and repeated attachment pinning use the same raw SQL mapping.
    await service.commitUserMessage({
      chatId: freshChat,
      message: message(),
      ownerId: owner,
      visibility: "private",
    });
    await assert.rejects(
      service.commitUserMessage({
        chatId: freshChat,
        message: message(),
        ownerId: stranger,
        visibility: "private",
      }),
      status(403)
    );

    const draft = await service.registerUpload(owner, existingChat, file());
    assert.deepEqual(
      (await service.readAsset(draft.pathname, owner, existingChat)).bytes,
      bytes
    );
    await service.deleteDraft(draft.pathname, owner);
    await assert.rejects(
      service.readAsset(draft.pathname, owner, existingChat),
      status(404)
    );
    await assert.rejects(access(join(destination, draft.pathname)));
    const [removed] =
      await sql`SELECT count(*)::int AS count FROM upload_assets WHERE id=${draft.pathname}`;
    assert.equal(removed.count, 0);
    // Removing the only owned test chat and running its cleanup deletes only its assets.
    await sql`DELETE FROM messages WHERE chat_id=${freshChat}`;
    await sql`DELETE FROM chats WHERE id=${freshChat}`;
    await service.cleanupDeletedChatAssets(freshChat);
    await assert.rejects(access(join(destination, id)));
    console.log(
      "Verified: real register/read/context/pin/re-pin/delete, existing and new chat ownership, cross-user isolation, original JSON keys, and scoped cleanup."
    );
  } finally {
    // Scope every cleanup query to this invocation's random IDs, including rows
    // created before a failure. Never disable settings or clear shared tables.
    const assets =
      await sql`SELECT id FROM upload_assets WHERE owner_id IN ${sql(userIds)}`;
    await sql`DELETE FROM messages WHERE chat_id IN ${sql(chatIds)}`;
    await sql`DELETE FROM upload_assets WHERE owner_id IN ${sql(userIds)}`;
    await sql`DELETE FROM chats WHERE id IN ${sql(chatIds)}`;
    await sql`DELETE FROM users WHERE id IN ${sql(userIds)}`;
    for (const asset of assets) {
      // biome-ignore lint/performance/noAwaitInLoops: Delete only this invocation's bounded fixture files.
      await rm(join(destination, asset.id), { force: true });
    }
    await sql.end();
  }
}

if (enabled && child) {
  lifecycle().then(
    () => process.exit(0),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    }
  );
} else {
  test("opt-in real PostgreSQL upload lifecycle preserves ownership and JSON field names", {
    skip: !enabled,
  }, () => {
    const output = execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        fileURLToPath(import.meta.url),
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CHATNEST_UPLOAD_LIFECYCLE_CHILD: "1",
          NODE_OPTIONS: "",
        },
        timeout: 60_000,
      }
    );
    assert.match(
      output,
      /Verified: real register\/read\/context\/pin\/re-pin\/delete/
    );
  });
}

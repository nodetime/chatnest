import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { tool } from "ai";
import ts from "typescript";
import { z } from "zod";

function load(file: string, modules: Record<string, unknown>) {
  const output = { exports: {} as Record<string, any> };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  runInNewContext(code, {
    exports: output.exports,
    module: output,
    require: (name: string) => {
      if (!Object.hasOwn(modules, name)) {
        throw new Error(`Unexpected dependency: ${name}`);
      }
      return modules[name];
    },
  });
  return output.exports;
}

function factory(save: (input: any) => Promise<unknown>) {
  return load("server/application/chat/tools/create-document.ts", {
    "@/server/application/document/artifact-service": {
      artifactKinds: ["text", "code", "sheet"],
    },
    "@/server/domain/message/ids": { generateUUID: () => "artifact-id" },
    "@/server/infrastructure/persistence/drizzle/document-repository": {
      documentRepository: { save },
    },
    ai: { tool },
    zod: { z },
  }).createDocument;
}

test("creation saves the agent's exact content once, then publishes a ready artifact without a second model", async () => {
  for (const kind of ["text", "code", "sheet"]) {
    const events: any[] = [];
    const createDocument = factory((savedInput) => {
      assert.equal(
        events.length,
        0,
        "no workspace state before successful save"
      );
      events.push({ saved: savedInput });
      return Promise.resolve();
    });
    const definition = createDocument({
      dataStream: { write: (part: unknown) => events.push(part) },
      session: { user: { id: "owner" } },
    });
    const input = {
      content:
        "# 实际比较\n\n[商品](https://detail.1688.com/offer/123.html)\n  保留空格\n",
      kind,
      title: "比较报告",
    };
    assert.equal(definition.inputSchema.parse(input).content, input.content);
    // biome-ignore lint/performance/noAwaitInLoops: Keep each artifact kind isolated with deterministic events.
    const result = await definition.execute(input);
    assert.equal(result.kind, kind);
    assert.equal(events[0].saved.content, input.content);
    assert.equal(events[0].saved.userId, "owner");
    assert.equal(events.filter((event) => event.saved).length, 1);
    assert.equal(
      events.find(
        (event) => event.type === `data-${kind === "text" ? "text" : kind}Delta`
      ).data,
      input.content
    );
    assert.equal(events.at(-1).type, "data-finish");
    for (const content of ["", "  \n", "x".repeat(100_001)]) {
      assert.equal(
        definition.inputSchema.safeParse({ ...input, content }).success,
        false
      );
    }
    assert.equal(
      definition.inputSchema.safeParse({ kind, title: "Missing body" }).success,
      false
    );
  }
});

test("missing identity and persistence failures never claim creation or publish phantom workspace state", async () => {
  const writes: unknown[] = [];
  const definition = factory(() => Promise.reject(new Error("save failed")))({
    dataStream: { write: (part: unknown) => writes.push(part) },
    session: { user: { id: "owner" } },
  });
  const input = { content: "实际内容", kind: "text", title: "报告" };
  await assert.rejects(definition.execute(input), /save failed/);
  assert.equal(writes.length, 0);
  let saved = false;
  const anonymous = factory(() => {
    saved = true;
    return Promise.resolve();
  })({
    dataStream: { write: (part: unknown) => writes.push(part) },
    session: {},
  });
  assert.equal((await anonymous.execute(input)).error, "Sign in required");
  assert.equal(saved, false);
  assert.equal(writes.length, 0);
});

test("a short newly saved artifact opens the workspace without relying on a text length window", () => {
  let state: any = {
    content: "older body",
    documentId: "old",
    isVisible: false,
    kind: "text",
    status: "idle",
  };
  let parts = [
    { data: "new", type: "data-id" },
    { data: "text", type: "data-kind" },
    { data: "简短报告", type: "data-title" },
    { data: null, type: "data-clear" },
    { data: "短报告", type: "data-textDelta" },
    { data: null, type: "data-finish" },
  ];
  const setArtifact = (fn: (current: unknown) => unknown) => {
    state = fn(state);
  };
  const { DataStreamHandler } = load(
    "app/_components/chat/data-stream-handler.tsx",
    {
      "./artifact": {
        artifactDefinitions: [
          {
            kind: "text",
            onStreamPart: ({ streamPart }: any) => {
              if (streamPart.type === "data-textDelta") {
                state.content += streamPart.data;
              }
            },
          },
        ],
      },
      "./data-stream-provider": {
        useDataStream: () => ({
          dataStream: parts,
          setDataStream: () => undefined,
        }),
      },
      "./sidebar-history": { getChatHistoryPaginationKey: () => null },
      "@/app/_hooks/use-artifact": {
        initialArtifactData: state,
        useArtifact: () => ({
          artifact: state,
          setArtifact,
          setMetadata: () => undefined,
        }),
      },
      "@/server/domain/document/stream-state": {},
      react: { useEffect: (fn: () => void) => fn() },
      swr: { useSWRConfig: () => ({ mutate: () => undefined }) },
      "swr/infinite": { unstable_serialize: () => "history" },
    }
  );
  const remaining = parts.slice(1);
  parts = parts.slice(0, 1);
  DataStreamHandler();
  assert.equal(state.documentId, "new");
  assert.equal(
    state.content,
    "",
    "new identity cannot show the old document between event batches"
  );
  assert.equal(state.isVisible, true);
  parts = remaining;
  DataStreamHandler();
  assert.equal(state.documentId, "new");
  assert.equal(state.content, "短报告");
  assert.equal(state.isVisible, true);
  assert.equal(state.status, "idle");
});

test("text artifact opens while suggestion metadata is still initializing", () => {
  const jsx = (type: unknown, props: unknown) => ({ props, type });
  const { textArtifact } = load("app/_artifacts/text/client.tsx", {
    "../actions": { getSuggestions: () => Promise.resolve([]) },
    "@/app/_components/chat/create-artifact": {
      Artifact: class {
        constructor(config: object) {
          Object.assign(this, config);
        }
      },
    },
    "@/app/_components/chat/diffview": {},
    "@/app/_components/chat/document-skeleton": {},
    "@/app/_components/chat/icons": {},
    "@/app/_components/chat/text-editor": { Editor: "editor" },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    sonner: { toast: {} },
  });
  for (const metadata of [
    undefined,
    { documentPendingChanges: false },
    { suggestions: [] },
  ]) {
    const tree = textArtifact.content({
      content: "真实报告",
      isCurrentVersion: true,
      metadata,
      mode: "edit",
    });
    const editor = tree.props.children.find(
      (node: any) => node?.type === "editor"
    );
    assert.equal(Array.isArray(editor.props.suggestions), true);
    assert.equal(editor.props.suggestions.length, 0);
  }
});

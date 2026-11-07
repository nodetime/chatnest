import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { streamText, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import ts from "typescript";
import { z } from "zod";
import {
  isValidSheetCsv,
  sheetCsvMatches,
} from "@/server/domain/document/sheet-csv";
import { ChatbotError } from "@/server/shared/errors";

test("统一保存入口拒绝错列和破损 CSV，合法引号及换行原样保存", async () => {
  const saved: any[] = [];
  let current: any[] = [];
  const manualWrites: any[] = [];
  const { documentRepository } = load(
    "server/infrastructure/persistence/drizzle/document-repository.ts",
    {
      "./client": {
        db: {
          transaction: (run: any) =>
            run({
              execute: () => Promise.resolve(),
              insert: () => ({
                values: (row: any) => ({
                  returning: () => {
                    saved.push(row);
                    return Promise.resolve([row]);
                  },
                }),
              }),
              select: () => ({
                from: () => ({
                  where: () => ({ orderBy: () => Promise.resolve(current) }),
                }),
              }),
              update: () => ({
                set: (row: any) => ({
                  where: () => ({
                    returning: () => {
                      manualWrites.push(row);
                      return Promise.resolve([row]);
                    },
                  }),
                }),
              }),
            }),
        },
      },
      "./schema": { document: {} },
      "@/server/domain/document/library": {},
      "@/server/domain/document/result-table": {
        isProtectedResultTable: () => false,
      },
      "@/server/domain/document/sheet-csv": { isValidSheetCsv },
      "@/server/shared/errors": {
        ChatbotError: class extends Error {},
      },
      "drizzle-orm": {
        and: () => null,
        desc: () => null,
        eq: () => null,
        sql: () => null,
      },
    }
  );
  const save = (content: string) =>
    documentRepository.save({
      content,
      id: "sheet",
      kind: "sheet",
      title: "对比表",
      userId: "owner",
    });
  await Promise.all(
    [
      "商品,链接,平台,备注\n台灯,,未返回链接,1688,未知",
      "商品,备注\n台灯",
      '商品,备注\n台灯,"未闭合',
      " \n",
    ].map((invalid) => assert.rejects(save(invalid), /bad_request:document/))
  );
  assert.equal(saved.length, 0, "校验失败不写入新版本");
  const valid = '商品,备注\r\n"台灯,暖白","用户备注\n第二行"\r\n';
  await save(valid);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].content, valid, "不自动改写、补列或缩写内容");
  current = saved;
  await assert.rejects(
    documentRepository.updateContent({
      content: "商品,备注\n台灯",
      id: "sheet",
    }),
    /bad_request:document/
  );
  assert.equal(manualWrites.length, 0);
  await documentRepository.updateContent({ content: valid, id: "sheet" });
  assert.equal(manualWrites[0].content, valid);
});

test("文档 API 将两种保存入口的校验失败返回 JSON 400，其他错误继续上抛", async () => {
  let failure: Error = new ChatbotError("bad_request:document");
  const { POST } = load("app/(chat)/api/document/route.ts", {
    "@/app/(auth)/auth": {
      auth: () => Promise.resolve({ user: { id: "owner" } }),
    },
    "@/server/composition": {
      getUseCases: () => ({
        documents: {
          listById: () => Promise.resolve([{ userId: "owner" }]),
          save: () => Promise.reject(failure),
          updateContent: () => Promise.reject(failure),
        },
      }),
    },
    "@/server/domain/document/result-table": {
      isProtectedResultTable: () => false,
    },
    "@/server/shared/errors": { ChatbotError },
    zod: { z },
  });
  const request = (isManualEdit: boolean) => ({
    json: () =>
      Promise.resolve({
        content: "商品,备注\n台灯",
        isManualEdit,
        kind: "text", // Manual writes must validate the persisted sheet kind.
        title: "对比表",
      }),
    url: "http://localhost/api/document?id=sheet",
  });
  await Promise.all(
    [false, true].map(async (manual) => {
      const response = await POST(request(manual));
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, "bad_request:document");
    })
  );
  failure = new Error("storage offline");
  await assert.rejects(POST(request(false)), /storage offline/);
});

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
    process: { env: {} },
    Response,
    require: (name: string) => {
      if (!Object.hasOwn(modules, name)) {
        throw new Error(`Unexpected dependency: ${name}`);
      }
      return modules[name];
    },
    URL,
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

for (const fails of [false, true]) {
  test(`整体修改${fails ? "失败保留旧工作区" : "成功打开正确表格"}，只在保存后发布`, async () => {
    const writes: any[] = [];
    const current = {
      content: "旧内容",
      id: "current-sheet",
      kind: "sheet",
      title: "对比表",
      userId: "owner",
    };
    const { updateDocument } = load(
      "server/application/chat/tools/update-document.ts",
      {
        "@/server/application/document/artifact-service": {
          documentHandlersByArtifactKind: [
            {
              kind: "sheet",
              onUpdateDocument: ({ dataStream }: any) => {
                dataStream.write({
                  data: "部分生成",
                  transient: true,
                  type: "data-sheetDelta",
                });
                dataStream.write({
                  data: "商品,备注\n台灯,用户备注",
                  transient: true,
                  type: "data-sheetDelta",
                });
                assert.equal(
                  writes.length,
                  0,
                  "未保存的生成结果不应改变用户工作区"
                );
                return fails
                  ? Promise.reject(new Error("save failed"))
                  : Promise.resolve();
              },
            },
          ],
        },
        "@/server/domain/document/result-table": {
          isProtectedResultTable: () => false,
        },
        "@/server/infrastructure/persistence/drizzle/document-repository": {
          documentRepository: {
            findLatestById: () => Promise.resolve(current),
          },
        },
        ai: { tool },
        zod: { z },
      }
    );
    const definition = updateDocument({
      dataStream: { write: (part: any) => writes.push(part) },
      modelId: "fixture",
      session: { user: { id: "owner" } },
    });
    const operation = definition.execute({
      description: "精简",
      id: current.id,
    });
    if (fails) {
      await assert.rejects(operation, /save failed/);
      assert.equal(writes.length, 0);
    } else {
      const result = await operation;
      assert.equal(result.id, current.id);
      assert.equal(result.previousContent, current.content);
      assert.equal(result.savedContent, "商品,备注\n台灯,用户备注");
      assert.deepEqual(
        writes.map((part) => part.type),
        [
          "data-id",
          "data-kind",
          "data-title",
          "data-clear",
          "data-sheetDelta",
          "data-finish",
        ]
      );
      assert.equal(writes[0].data, current.id);
      assert.equal(writes[1].data, "sheet");
      assert.equal(writes.at(-2).data, "商品,备注\n台灯,用户备注");
    }
  });
}

test("表格匹配比较完整单元格内容：引号写法等价可保存，真实变化及破损结构拒绝覆盖", async () => {
  const current = {
    content: '名称,备注\r\n"台灯","用户备注"\r\n',
    id: "sheet",
    kind: "sheet",
    title: "对比表",
    userId: "owner",
  };
  const saved: any[] = [];
  const writes: any[] = [];
  const { editDocument } = load(
    "server/application/chat/tools/edit-document.ts",
    {
      "@/server/domain/document/result-table": {
        isProtectedResultTable: () => false,
      },
      "@/server/domain/document/sheet-csv": { sheetCsvMatches },
      "@/server/infrastructure/persistence/drizzle/document-repository": {
        documentRepository: {
          findLatestById: () => Promise.resolve(current),
          save: (input: any) => {
            saved.push(input);
            return Promise.resolve();
          },
        },
      },
      ai: { tool },
      zod: { z },
    }
  );
  const edit = editDocument({
    dataStream: { write: (part: any) => writes.push(part) },
    session: { user: { id: "owner" } },
  });
  const next = '名称,备注\n流云石台灯,"用户备注\n$& $$"';
  const result = await edit.execute({
    id: current.id,
    new_string: next,
    old_string: "名称,备注\n台灯,用户备注",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.savedContent, next);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].content, next, "只匹配旧表，提交的新正文逐字保存");
  writes.length = 0;
  for (const old_string of [
    "名称,备注\n台灯,旧备注",
    "名称,备注\n台灯, 用户备注",
    "名称,备注\n台灯,用户备注\n,",
    "名称,备注\n台灯,用户备注\n , ",
    "名称,备注\n台灯",
    '名称,备注\n台灯,"用户备注',
    "名称,备注",
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: Each rejected edit must independently prove no save or stream was emitted.
    const rejected = await edit.execute({
      id: current.id,
      new_string: next,
      old_string,
    });
    assert.ok(rejected.error, "旧表必须完整且逐格一致");
    assert.equal(rejected.savedContent, current.content);
    assert.equal(saved.length, 1);
    assert.equal(writes.length, 0);
  }
});

test("表格整份提交且保留字面值，文本和代码仍支持局部编辑", async () => {
  const writes: any[] = [];
  let saves = 0;
  let expected = "商品,备注\n流云石菇台灯,$& $$ 待实物复核";
  const current = {
    content: "商品,备注\n台灯,待实物复核",
    id: "sheet",
    kind: "sheet",
    title: "对比表",
    userId: "owner",
  };
  const { editDocument } = load(
    "server/application/chat/tools/edit-document.ts",
    {
      "@/server/domain/document/result-table": {
        isProtectedResultTable: () => false,
      },
      "@/server/domain/document/sheet-csv": { sheetCsvMatches },
      "@/server/infrastructure/persistence/drizzle/document-repository": {
        documentRepository: {
          findLatestById: () => Promise.resolve(current),
          save: (input: any) => {
            saves += 1;
            assert.equal(input.content, expected);
            assert.equal(writes.length, 0);
            return Promise.resolve();
          },
        },
      },
      ai: { tool },
      zod: { z },
    }
  );
  const partial = await editDocument({
    dataStream: { write: (part: any) => writes.push(part) },
    session: { user: { id: "owner" } },
  }).execute({ id: "sheet", new_string: "备注,商品", old_string: "商品,备注" });
  assert.equal(partial.error, "old_string not found in document");
  assert.equal(partial.savedContent, current.content);
  assert.equal(saves, 0, "只换表头不能写出字段错位的中间版本");
  assert.equal(writes.length, 0);
  const edited = await editDocument({
    dataStream: { write: (part: any) => writes.push(part) },
    session: { user: { id: "owner" } },
  }).execute({
    id: "sheet",
    new_string: expected,
    old_string: current.content,
  });
  assert.equal(edited.savedContent, expected);
  assert.equal(writes[0].type, "data-id");
  assert.equal(writes[0].data, "sheet");
  assert.equal(writes[1].data, "sheet");
  assert.equal(writes.at(-1).type, "data-finish");
  assert.equal(saves, 1);
  writes.length = 0;
  const unchanged = await editDocument({
    dataStream: { write: (part: any) => writes.push(part) },
    session: { user: { id: "owner" } },
  }).execute({
    id: "sheet",
    new_string: current.content,
    old_string: current.content,
  });
  assert.equal(unchanged.savedContent, current.content);
  assert.equal(saves, 1, "原样替换不应重复生成版本");
  assert.equal(writes.length, 0);
  const mismatch = await editDocument({
    dataStream: { write: (part: any) => writes.push(part) },
    session: { user: { id: "owner" } },
  }).execute({ id: "sheet", new_string: "新值", old_string: "不存在的旧值" });
  assert.equal(mismatch.error, "old_string not found in document");
  assert.equal(mismatch.savedContent, current.content);
  const forbidden = await editDocument({
    dataStream: { write: (part: any) => writes.push(part) },
    session: { user: { id: "other" } },
  }).execute({ id: "sheet", new_string: "新值", old_string: "台灯" });
  assert.equal(forbidden.error, "Forbidden");
  assert.equal(forbidden.savedContent, undefined);
  assert.equal(saves, 1);
  assert.equal(writes.length, 0);
  for (const kind of ["text", "code"]) {
    current.kind = kind;
    expected = "商品,备注\n流云石菇台灯,$& $$ 待实物复核";
    // biome-ignore lint/performance/noAwaitInLoops: Cases mutate the same fixture and check each save before advancing.
    const local = await editDocument({
      dataStream: { write: (part: any) => writes.push(part) },
      session: { user: { id: "owner" } },
    }).execute({
      id: current.id,
      new_string: "流云石菇台灯,$& $$ 待实物复核",
      old_string: "台灯,待实物复核",
      replace_all: kind === "code",
    });
    assert.equal(local.savedContent, expected);
    writes.length = 0;
  }
  assert.equal(saves, 3);
});

for (const mode of ["complete", "empty", "truncated", "error"] as const) {
  test(`真实 SDK 表格整体修改 ${mode}：失败不覆盖保存内容`, async () => {
    const saved: any[] = [];
    const writes: any[] = [];
    const model = new MockLanguageModelV4({
      doStream: () =>
        Promise.resolve({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              if (mode === "error") {
                controller.enqueue({
                  error: new Error("provider failed"),
                  type: "error",
                });
              } else {
                controller.enqueue({ id: "text", type: "text-start" });
                controller.enqueue({
                  delta: mode === "empty" ? "" : "商品,备注\n台灯,用户备注",
                  id: "text",
                  type: "text-delta",
                });
                controller.enqueue({ id: "text", type: "text-end" });
                controller.enqueue({
                  finishReason: {
                    raw: mode === "truncated" ? "length" : "stop",
                    unified: mode === "truncated" ? "length" : "stop",
                  },
                  type: "finish",
                  usage: {
                    inputTokens: {
                      cacheRead: 0,
                      cacheWrite: 0,
                      noCache: 1,
                      total: 1,
                    },
                    outputTokens: { reasoning: 0, text: 1, total: 1 },
                  },
                });
              }
              controller.close();
            },
          }),
        }),
    });
    const service = load("server/application/document/artifact-service.ts", {
      "./kinds/code": {},
      "./kinds/sheet": {},
      "./kinds/text": {},
      "@/server/infrastructure/persistence/drizzle/document-repository": {
        documentRepository: {
          save: (input: any) => {
            saved.push(input);
            return Promise.resolve();
          },
        },
      },
    });
    const handler = load("server/application/document/kinds/sheet.ts", {
      "../artifact-service": service,
      "@/server/application/ai/prompts": {
        updateDocumentPrompt: (content: string) => content,
      },
      "@/server/application/ai/providers": { getLanguageModel: () => model },
      "@/server/shared/telemetry": { metadataOnlyTelemetry: {} },
      ai: { streamText },
    }).sheetDocumentHandler;
    const update = handler.onUpdateDocument({
      dataStream: { write: (part: any) => writes.push(part) },
      description: "精简，保留备注",
      document: {
        content: "商品,备注\n原版,用户备注",
        id: "sheet",
        kind: "sheet",
        title: "表格",
      },
      modelId: "fixture",
      session: { user: { id: "owner" } },
    });
    if (mode === "complete") {
      await update;
      assert.equal(saved.length, 1);
      assert.equal(saved[0].content, "商品,备注\n台灯,用户备注");
      assert.equal(writes.at(-1).data, saved[0].content);
    } else {
      await assert.rejects(update, /表格修改未/);
      assert.equal(saved.length, 0);
      assert.equal(writes.length, 0);
    }
  });
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
    assert.equal(result.savedContent, events[0].saved.content);
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
  const rejected = await anonymous.execute(input);
  assert.equal(rejected.error, "Sign in required");
  assert.equal(rejected.savedContent, undefined);
  assert.equal(saved, false);
  assert.equal(writes.length, 0);
});

test("a short newly saved artifact opens the workspace without relying on a text length window", () => {
  let opened = 0;
  let historyUpdates = 0;
  const refreshedDocuments: string[] = [];
  let metadata: any = null;
  const blockedArtifact = { current: false };
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
      "./artifact-catalog": load(
        "app/_components/chat/artifact-catalog.ts",
        {}
      ),
      "./data-stream-provider": {
        useDataStream: () => ({
          dataStream: parts,
          setDataStream: () => undefined,
        }),
      },
      "./sidebar-history": { getChatHistoryPaginationKey: () => null },
      "@/app/_hooks/use-active-chat": {
        useActiveChat: () => ({ chatId: "chat" }),
      },
      "@/app/_hooks/use-artifact": {
        initialArtifactData: state,
        useArtifact: () => ({
          artifact: state,
          metadata,
          setArtifact,
          setMetadata: () => undefined,
        }),
      },
      "@/app/_hooks/use-workspace": {
        useWorkspace: () => ({
          show: (tab: string) => {
            assert.equal(tab, "document");
            opened += 1;
          },
        }),
      },
      "@/server/domain/document/stream-state": {},
      react: {
        useEffect: (fn: () => void) => fn(),
        useRef: () => blockedArtifact,
      },
      swr: {
        useSWRConfig: () => ({
          mutate: (key: string) => {
            if (key === "history") {
              historyUpdates += 1;
            } else {
              refreshedDocuments.push(key);
            }
          },
        }),
      },
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
  assert.equal(opened, 1);
  // Reopening an update to the same artifact must not depend on a visible/id
  // transition; the workspace may have been closed independently.
  state.isVisible = true;
  parts = [
    { data: "new", type: "data-id" },
    { data: null, type: "data-finish" },
  ];
  DataStreamHandler();
  assert.equal(opened, 2);
  assert.deepEqual(refreshedDocuments, [
    "/api/document?id=new&chatId=chat",
    "/api/document?id=new&chatId=chat",
  ]);

  for (const dirtyFlag of [
    "documentPendingChanges",
    "resultTablePendingChanges",
  ]) {
    metadata = { [dirtyFlag]: true };
    state.content = "尚未保存的用户修改";
    parts = [{ data: "other", type: "data-id" }];
    DataStreamHandler();
    // Streaming events can arrive in separate renders. Keep the whole blocked
    // artifact out of the editor, while unrelated chat metadata still works.
    parts = [
      { data: "text", type: "data-kind" },
      { data: null, type: "data-clear" },
      { data: "另一份已保存文件", type: "data-textDelta" },
      { data: "对话新标题", type: "data-chat-title" },
      { data: null, type: "data-finish" },
    ];
    DataStreamHandler();
    assert.equal(state.documentId, "new");
    assert.equal(state.content, "尚未保存的用户修改");
    assert.equal(state.status, "idle");
    assert.equal(opened, 2);
  }
  assert.equal(historyUpdates, 2);
  metadata = null;
  parts = [
    { data: "other", type: "data-id" },
    { data: null, type: "data-clear" },
    { data: "另一份已保存文件", type: "data-textDelta" },
    { data: null, type: "data-finish" },
  ];
  DataStreamHandler();
  assert.equal(state.documentId, "other");
  assert.equal(state.content, "另一份已保存文件");
  assert.equal(opened, 3);
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

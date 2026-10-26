// biome-ignore-all lint/style/noNonNullAssertion: Test fixtures establish execution/model projection handlers.
// biome-ignore-all lint/suspicious/useAwait: Deterministic asynchronous fixtures implement SDK contracts.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildResultTable,
  isProtectedResultTable,
  parseResultTable,
  resolvePointer,
  resultCsv,
  resultRows,
  safeSourceUrl,
} from "@/server/domain/document/result-table";
import {
  ResultEvidenceLedger,
  restoreResultEvidence,
  sourceModelOutput,
} from "@/server/domain/message/result-evidence";

const source = {
  completedAt: "2026-10-20T12:00:00.000Z",
  serverId: "fixture",
  serverName: "Fixture",
  timeBasis: "tool-completed" as const,
  toolCallId: "actual-call",
  toolName: "fixture__search",
};
const rows = [
  {
    item_url: "https://example.test/one",
    nested: { x: 1 },
    note: "=CMD()",
    price: 12,
    title: "第一项",
  },
  {
    item_url: "javascript:alert(1)",
    note: "\t=SUM(1,2)",
    price: 2,
    title: "第二项",
  },
  { price: null, title: "空价格" },
];
function ledger() {
  const value = new ResultEvidenceLedger();
  value.record(source, { structuredContent: { items: rows } });
  return value;
}
test("table copies actual raw rows and resolves exact strict pointers, never invented values", () => {
  const table = buildResultTable(
    ledger(),
    {
      columns: [
        { label: "商品", path: "/title" },
        { label: "价格", path: "/price" },
        { label: "空", path: "/missing" },
      ],
      rowsPath: "/items",
      sourceToolCallId: "actual-call",
      title: "结果",
    },
    "chat"
  );
  assert.deepEqual(table.rows, rows);
  assert.notEqual(table.rows, rows);
  assert.equal(table.source.toolCallId, "actual-call");
  assert.equal(resolvePointer(table.rows[0], "/missing"), undefined);
  assert.throws(() =>
    buildResultTable(
      ledger(),
      { rowsPath: "/items", sourceToolCallId: "forged", title: "X" },
      "chat"
    )
  );
  assert.equal(resolvePointer({ "a/b": { "~": 9 } }, "/a~1b/~0"), 9);
  for (const pointer of [
    "/__proto__",
    "/constructor",
    "/nested/~2",
    "/items/00",
    "/items/-",
    "/items/4",
  ]) {
    assert.throws(() => resolvePointer({ items: rows }, pointer));
  }
});
test("object arrays, empty arrays, source and table limits are explicit not truncated", () => {
  const value = ledger();
  value.record(
    { ...source, toolCallId: "empty" },
    { structuredContent: { items: [] } }
  );
  assert.equal(
    buildResultTable(
      value,
      { rowsPath: "/items", sourceToolCallId: "empty", title: "空" },
      "chat"
    ).rows.length,
    0
  );
  value.record(
    { ...source, toolCallId: "bad" },
    { content: [{ text: 'prose {"items":[]}', type: "text" }] }
  );
  assert.throws(() =>
    buildResultTable(
      value,
      { rowsPath: "/items", sourceToolCallId: "bad", title: "X" },
      "chat"
    )
  );
  assert.equal(
    value.record(
      { ...source, toolCallId: "huge" },
      { structuredContent: { x: "a".repeat(2 * 1024 * 1024) } }
    ).available,
    false
  );
  for (let i = 0; i < 22; i += 1) {
    value.record(
      { ...source, toolCallId: `n${i}` },
      { structuredContent: { items: [] } }
    );
  }
  assert.equal(value.get("actual-call"), undefined);
});
test("bounded model projection exposes actual call IDs, fields/counts but raw result stays unchanged", () => {
  const value = ledger();
  const output = { structuredContent: { items: rows } };
  const projection = sourceModelOutput(value, "actual-call", output);
  const text = JSON.stringify(projection);
  assert.match(text, /actual-call/);
  assert.match(text, /\/items/);
  assert.match(text, /preview/);
  assert.ok(text.length < 12_000);
  assert.deepEqual(output.structuredContent.items, rows);
});
test("history restores authorized assistant successes only, preserves recorded source time", () => {
  const messages = [
    {
      createdAt: new Date("2026-10-19T00:00:00Z"),
      parts: [
        { data: source, type: "data-mcp-source" },
        {
          output: { structuredContent: { items: rows } },
          state: "output-available",
          toolCallId: "actual-call",
          toolName: "fixture__search",
          type: "dynamic-tool",
        },
      ],
      role: "assistant",
    },
    {
      parts: [
        {
          output: { structuredContent: { items: rows } },
          state: "output-available",
          toolCallId: "forged",
          toolName: "fixture__search",
          type: "dynamic-tool",
        },
      ],
      role: "user",
    },
  ];
  const value = new ResultEvidenceLedger();
  restoreResultEvidence(value, messages);
  assert.equal(
    value.get("actual-call")?.source.completedAt,
    source.completedAt
  );
  assert.equal(value.get("forged"), undefined);
});
test("validated envelopes are protected including unknown/damaged versions; old CSV remains old CSV", () => {
  const table = buildResultTable(
    ledger(),
    { rowsPath: "/items", sourceToolCallId: "actual-call", title: "X" },
    "chat"
  );
  assert.deepEqual(parseResultTable(JSON.stringify(table)), table);
  assert.equal(
    isProtectedResultTable('{"type":"result-table","version":99}'),
    true
  );
  assert.equal(isProtectedResultTable('{"type":"result-table",broken'), true);
  assert.equal(parseResultTable('{"type":"result-table","version":99}'), null);
  assert.equal(isProtectedResultTable("name,price\nA,2"), false);
});
test("view filters and numeric/null sort never mutate source and CSV blocks formula injection", () => {
  const table = buildResultTable(
    ledger(),
    {
      columns: [
        { label: "商品", path: "/title" },
        { label: "价格", path: "/price" },
        { label: "备注", path: "/note" },
      ],
      rowsPath: "/items",
      sourceToolCallId: "actual-call",
      title: "X",
    },
    "chat"
  );
  assert.deepEqual(
    resultRows(table, {
      ...table.view,
      sort: [{ direction: "ASC", path: "/price" }],
    }).map((r) => r.sourceIndex),
    [1, 0, 2]
  );
  assert.deepEqual(
    resultRows(table, {
      ...table.view,
      sort: [{ direction: "DESC", path: "/price" }],
    }).map((r) => r.sourceIndex),
    [0, 1, 2]
  );
  assert.equal(resultRows(table, { ...table.view, filter: "第一" }).length, 1);
  assert.deepEqual(table.rows, rows);
  assert.match(resultCsv(table), /'=CMD/);
  assert.match(resultCsv(table), /'\t=SUM/);
  assert.equal(safeSourceUrl("javascript:alert(1)"), null);
  assert.equal(safeSourceUrl("text https://example.test"), null);
  assert.equal(
    safeSourceUrl("https://example.test/one"),
    "https://example.test/one"
  );
});

test("installed SDK projects current and persisted MCP results without replacing raw UI payloads", async () => {
  const { createAgentRuntime } = await import("@/server/agent/runtime");
  const { agentConfigSchema } = await import("@/server/agent/config");
  const { convertToModelMessages } = await import("ai");
  const { historyProjectionTools } = await import(
    "@/server/domain/message/result-evidence"
  );
  const value = new ResultEvidenceLedger();
  const events: unknown[] = [];
  const raw = { structuredContent: { items: rows } };
  const config = agentConfigSchema.parse({
    servers: [
      {
        allowedTools: ["search"],
        autoApproveTools: ["search"],
        id: "fixture",
        name: "Fixture",
        url: "https://fixture.test/mcp",
      },
    ],
  });
  const runtime = await createAgentRuntime(
    new AbortController().signal,
    async () =>
      ({
        close: async () => undefined,
        tools: async () => ({
          search: {
            execute: async () => raw,
            inputSchema: { jsonSchema: { type: "object" } },
          },
        }),
      }) as never,
    async () => config,
    { ledger: value, onSource: (metadata) => events.push(metadata) }
  );
  try {
    const tool = runtime.tools.fixture__search;
    const output = await tool.execute!(
      {},
      { context: {}, messages: [], toolCallId: "literal-sdk-id" }
    );
    assert.deepEqual(output, raw);
    assert.equal(events.length, 1);
    assert.match(
      JSON.stringify(
        await tool.toModelOutput!({
          input: {},
          output,
          toolCallId: "literal-sdk-id",
        })
      ),
      /literal-sdk-id/
    );
    const stored = [
      {
        id: "assistant",
        parts: [
          {
            input: {},
            output,
            state: "output-available" as const,
            toolCallId: "literal-sdk-id",
            toolName: "fixture__search",
            type: "dynamic-tool" as const,
          },
        ],
        role: "assistant" as const,
      },
    ];
    const model = await convertToModelMessages(stored, {
      tools: historyProjectionTools(value, stored),
    });
    assert.match(JSON.stringify(model), /sourceToolCallId/);
    assert.deepEqual(stored[0].parts[0].output, raw);
  } finally {
    await runtime.close();
  }
});

test("one result-table event replaces identity/kind/content atomically even after text-kind stream state", async () => {
  const { applyResultTableEvent } = await import(
    "@/server/domain/document/stream-state"
  );
  const prior = {
    boundingBox: { height: 1, left: 0, top: 0, width: 1 },
    content: "old text",
    documentId: "old",
    isVisible: false,
    kind: "text" as const,
    status: "streaming" as const,
    title: "old",
  };
  const result = applyResultTableEvent(prior, {
    chatId: "chat",
    content: '{"type":"result-table"}',
    id: "table",
    kind: "sheet",
    title: "Table",
    version: "v1",
  });
  assert.equal(result.kind, "sheet");
  assert.equal(result.documentId, "table");
  assert.equal(result.status, "idle");
  assert.equal(result.isVisible, true);
  assert.equal(prior.kind, "text");
});

test("row snapshots retain own prototype-named fields exactly; model limits are UTF8 and aggregate bounded", () => {
  const value = new ResultEvidenceLedger();
  const original = JSON.parse(
    '{"structuredContent":{"items":[{"__proto__":{"hello":1},"constructor":"raw","ok":1}]}}'
  );
  value.record(source, original);
  const table = buildResultTable(
    value,
    {
      columns: [{ path: "/ok" }],
      rowsPath: "/items",
      sourceToolCallId: source.toolCallId,
      title: "X",
    },
    "chat"
  );
  assert.deepEqual(table.rows, original.structuredContent.items);
  let total = 0;
  for (let i = 0; i < 20; i += 1) {
    const id = `huge-key-${i}`;
    const output = {
      structuredContent: { items: [{ ["中".repeat(200_000)]: 1 }] },
    };
    value.record({ ...source, toolCallId: id }, output);
    const projection = sourceModelOutput(value, id, output);
    const bytes = Buffer.byteLength(JSON.stringify(projection), "utf8");
    assert.ok(bytes <= 8192, `${bytes}`);
    total += bytes;
  }
  assert.ok(total <= 128 * 1024);
});
test("table 500 row / 30 column / 1MiB UTF8 bounds explicitly reject complete envelope rather than truncate", () => {
  const cases = [
    {
      error: /limit is 500 rows/,
      items: Array.from({ length: 501 }, () => ({ n: 1 })),
    },
    {
      error: /limit is 30 columns/,
      items: [
        Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`f${i}`, i])),
      ],
    },
    {
      error: /envelope exceeds 1 MiB UTF-8/,
      items: [{ body: "中".repeat(360_000) }],
    },
  ];
  for (const [index, fixture] of cases.entries()) {
    const value = new ResultEvidenceLedger();
    const toolCallId = `bounds-${index}`;
    assert.equal(
      value.record(
        { ...source, toolCallId },
        { structuredContent: { items: fixture.items } }
      ).available,
      true,
      "each boundary case starts from its own eligible, unambiguous source"
    );
    assert.throws(
      () =>
        buildResultTable(
          value,
          { rowsPath: "/items", sourceToolCallId: toolCallId, title: "X" },
          "chat"
        ),
      fixture.error
    );
  }
});

test("approval transport carries only decisions, not persisted raw MCP/table/file values", async () => {
  const { compactToolApprovals } = await import(
    "@/server/domain/message/approval-transport"
  );
  const input = [
    { id: "u", parts: [{ text: "private", type: "text" }], role: "user" },
    {
      id: "a",
      parts: [
        {
          output: "x".repeat(900_000),
          state: "output-available",
          toolCallId: "raw",
          toolName: "fixture__search",
          type: "dynamic-tool",
        },
        { data: "x".repeat(900_000), type: "data-resultTable" },
        {
          approval: { approved: true, id: "decision" },
          input: { secret: "private" },
          state: "approval-responded",
          toolCallId: "pending",
          toolName: "fixture__search",
          type: "dynamic-tool",
        },
      ],
      role: "assistant",
    },
  ];
  const result = compactToolApprovals(input);
  assert.ok(JSON.stringify(result).length < 500);
  assert.deepEqual(result, [
    {
      id: "a",
      parts: [
        {
          approval: { approved: true, id: "decision" },
          state: "approval-responded",
          toolCallId: "pending",
          type: "dynamic-tool",
        },
      ],
      role: "assistant",
    },
  ]);
});

test("model preview contains actual row values and non-JSON successes do not evict eligible history evidence", async () => {
  const previewLedger = new ResultEvidenceLedger();
  const json = {
    structuredContent: {
      items: [
        { price: 12, title: "Foo actual", url: "https://example.test/foo" },
      ],
    },
  };
  previewLedger.record(source, json);
  assert.match(
    JSON.stringify(sourceModelOutput(previewLedger, source.toolCallId, json)),
    /Foo actual/
  );
  const messages = [
    {
      createdAt: source.completedAt,
      parts: [
        { data: source, type: "data-mcp-source" },
        {
          output: json,
          state: "output-available",
          toolCallId: source.toolCallId,
          toolName: source.toolName,
          type: "dynamic-tool",
        },
      ],
      role: "assistant",
    },
    ...Array.from({ length: 20 }, (_, i) => ({
      createdAt: source.completedAt,
      parts: [
        {
          output: { content: [{ text: "plain text", type: "text" }] },
          state: "output-available",
          toolCallId: `text${i}`,
          toolName: source.toolName,
          type: "dynamic-tool",
        },
      ],
      role: "assistant",
    })),
  ];
  const restored = new ResultEvidenceLedger();
  restoreResultEvidence(restored, messages);
  assert.ok(restored.get(source.toolCallId));
  const { historyProjectionTools, boundedMcpHistory } = await import(
    "@/server/domain/message/result-evidence"
  );
  const tools = historyProjectionTools(restored, messages);
  const bounded = boundedMcpHistory(messages, tools, restored);
  assert.ok(
    bounded.some((message) =>
      message.parts.some(
        (part: unknown) =>
          !!part &&
          typeof part === "object" &&
          "toolCallId" in part &&
          part.toolCallId === source.toolCallId
      )
    ),
    "retained eligible source remains discoverable in bounded model history"
  );
  assert.match(
    JSON.stringify(sourceModelOutput(restored, source.toolCallId, json)),
    /actual-call/
  );
});
test("view/notes updates obey whole-envelope cap before persistence", async () => {
  const { withResultTableView } = await import(
    "@/server/domain/document/result-table"
  );
  const value = new ResultEvidenceLedger();
  value.record(source, {
    structuredContent: { items: [{ text: "a".repeat(1_040_000) }] },
  });
  const table = buildResultTable(
    value,
    { rowsPath: "/items", sourceToolCallId: source.toolCallId, title: "X" },
    "chat"
  );
  assert.throws(() =>
    withResultTableView(table, table.view, "a".repeat(10_000))
  );
});

test("combined latest history plus current MCP projections remain <=128KiB and adapter reinvocation is pure", async () => {
  const { historyProjectionTools, boundedMcpHistory } = await import(
    "@/server/domain/message/result-evidence"
  );
  const value = new ResultEvidenceLedger();
  const output = {
    structuredContent: {
      items: [
        {
          price: 12,
          title: "中".repeat(180),
          url: "https://example.test/item",
        },
      ],
    },
  };
  const messages = Array.from({ length: 80 }, (_, i) => ({
    createdAt: source.completedAt,
    id: `m${i}`,
    parts: [
      {
        input: {},
        output,
        state: "output-available",
        toolCallId: `history-${i}`,
        toolName: source.toolName,
        type: "dynamic-tool",
      },
    ],
    role: "assistant",
  }));
  restoreResultEvidence(value, messages);
  const tools = historyProjectionTools(value, messages);
  const bounded = boundedMcpHistory(messages, tools, value);
  assert.equal(bounded.flatMap((message) => message.parts).length, 20);
  let total = 0;
  for (const message of bounded) {
    for (const part of message.parts) {
      const projection = sourceModelOutput(value, part.toolCallId, part.output);
      assert.deepEqual(
        sourceModelOutput(value, part.toolCallId, part.output),
        projection
      );
      total += Buffer.byteLength(JSON.stringify(projection), "utf8");
    }
  }
  for (let i = 0; i < 32; i += 1) {
    value.reserveCurrentCall();
    const id = `current-${i}`;
    value.record({ ...source, toolCallId: id }, output);
    total += Buffer.byteLength(
      JSON.stringify(sourceModelOutput(value, id, output)),
      "utf8"
    );
  }
  assert.throws(() => value.reserveCurrentCall());
  assert.ok(total <= 128 * 1024, `${total}`);
});
test("damaged escaped discriminator stays protected", () => {
  assert.equal(
    isProtectedResultTable('{"\\u0074ype":"result\\u002dtable",broken'),
    true
  );
});

test("reopening the same cached artifact preserves hydrated content; switching IDs clears stale content", async () => {
  const { openArtifactPreview } = await import(
    "@/server/domain/document/stream-state"
  );
  const boundingBox = { height: 20, left: 1, top: 2, width: 100 };
  const prior = {
    boundingBox,
    content: "name,price\nActual,12",
    documentId: "cached-sheet",
    isVisible: false,
    kind: "sheet" as const,
    status: "idle" as const,
    title: "Cached",
  };
  const reopened = openArtifactPreview(
    prior,
    { id: "cached-sheet", kind: "sheet", title: "Cached" },
    boundingBox
  );
  assert.equal(reopened.content, prior.content);
  assert.equal(reopened.isVisible, true);
  assert.equal(reopened.documentId, prior.documentId);
  const switched = openArtifactPreview(
    prior,
    { id: "another-sheet", kind: "sheet", title: "Another" },
    boundingBox
  );
  assert.equal(switched.content, "");
  assert.equal(switched.documentId, "another-sheet");
  assert.equal(prior.isVisible, false);
});

test("ambiguous duplicate source IDs never overwrite original provenance or multiply projected history", async () => {
  const { historyProjectionTools, boundedMcpHistory } = await import(
    "@/server/domain/message/result-evidence"
  );
  const messages = Array.from({ length: 200 }, (_, i) => ({
    createdAt: source.completedAt,
    id: `duplicate-${i}`,
    parts: [
      {
        input: {},
        output: {
          structuredContent: {
            items: [{ original: i, title: "中".repeat(180) }],
          },
        },
        state: "output-available",
        toolCallId: "reused-call",
        toolName: source.toolName,
        type: "dynamic-tool",
      },
    ],
    role: "assistant",
  }));
  const value = new ResultEvidenceLedger();
  restoreResultEvidence(value, messages);
  assert.equal(value.get("reused-call"), undefined);
  assert.equal(value.projection("reused-call"), undefined);
  const tools = historyProjectionTools(value, messages);
  assert.equal(
    boundedMcpHistory(messages, tools, value).reduce(
      (count, message) => count + message.parts.length,
      0
    ),
    0
  );
  const current = ledger();
  assert.throws(() => current.reserveCurrentCall("actual-call"));
  assert.equal(current.get("actual-call"), undefined);
  const sameTask = new ResultEvidenceLedger();
  sameTask.reserveCurrentCall("new-call");
  sameTask.record(
    { ...source, toolCallId: "new-call" },
    { structuredContent: { items: rows } }
  );
  assert.throws(() => sameTask.reserveCurrentCall("new-call"));
  assert.equal(sameTask.get("new-call"), undefined);
});
test("generic version deletion rejects any protected history, retaining immutability tombstone", async () => {
  const { assertGenericDocumentDeletionAllowed } = await import(
    "@/server/domain/document/result-table"
  );
  assert.throws(() =>
    assertGenericDocumentDeletionAllowed([
      "name,price\nA,2",
      '{"type":"result-table","version":999}',
    ])
  );
  assert.throws(() =>
    assertGenericDocumentDeletionAllowed(['{"type":"result-table",broken'])
  );
  assert.doesNotThrow(() =>
    assertGenericDocumentDeletionAllowed(["name,price\nA,2"])
  );
});

test("the same authorized pending approval resumes once, but is not a new reusable source identity", () => {
  const value = new ResultEvidenceLedger();
  value.observeHistoryCall("pending-call", "fixture__search");
  assert.doesNotThrow(() =>
    value.reserveCurrentCall("pending-call", "fixture__search")
  );
  value.record(
    { ...source, toolCallId: "pending-call" },
    { structuredContent: { items: rows } }
  );
  assert.ok(value.get("pending-call"));
  assert.throws(() =>
    value.reserveCurrentCall("pending-call", "fixture__search")
  );
  assert.equal(value.get("pending-call"), undefined);
  const mismatch = new ResultEvidenceLedger();
  mismatch.observeHistoryCall("pending", "fixture__search");
  assert.throws(() =>
    mismatch.reserveCurrentCall("pending", "different__tool")
  );
});

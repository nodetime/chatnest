import assert from "node:assert/strict";
import test from "node:test";
import {
  activitySummary,
  groupActivityMessages,
  groupActivityParts,
  initialActivityDisclosure,
  reconcileActivityDisclosure,
} from "../../components/chat/activity-groups";
import type { ChatMessage } from "../../lib/types";

const tool = (id: string, state = "output-available", extra = {}) =>
  ({
    input: {},
    output: {},
    state,
    toolCallId: id,
    toolName: "fixture__search",
    type: "dynamic-tool",
    ...extra,
  }) as Extract<ChatMessage["parts"][number], { type: "dynamic-tool" }>;
const message = (
  id: string,
  parts: ChatMessage["parts"],
  role: ChatMessage["role"] = "assistant"
): ChatMessage => ({ id, parts, role });

test("consecutive tool-only messages group without changing messages, parts or identities", () => {
  const a = message("a", [{ type: "step-start" }, tool("a")]);
  const b = message("b", [tool("b")]);
  const input = [
    a,
    b,
    message("user", [{ text: "next", type: "text" }], "user"),
    message("c", [tool("c")]),
  ];
  const grouped = groupActivityMessages(input);
  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].kind, "activity");
  if (grouped[0].kind !== "activity") {
    throw new Error("expected activity");
  }
  assert.equal(grouped[0].messages[0].message, a);
  assert.equal(grouped[0].messages[1].message, b);
  assert.equal(a.parts[1], grouped[0].parts[0]);
  assert.deepEqual(
    input.map((item) => item.id),
    ["a", "b", "user", "c"]
  );
});

test("mixed parts retain every visible boundary and special renderer outside groups", () => {
  const boundaries = [
    { text: "answer", type: "text" },
    { text: "reason", type: "reasoning" },
    { sourceId: "source", type: "source-url", url: "https://example.test" },
    ...[
      "getWeather",
      "createDocument",
      "updateDocument",
      "requestSuggestions",
      "createResultTable",
    ].map((name) => ({ ...tool(name), type: `tool-${name}` })),
    { mediaType: "image/png", type: "file", url: "/fixture" },
  ] as ChatMessage["parts"];
  for (const boundary of boundaries) {
    const parts = groupActivityParts([
      tool("a"),
      tool("b"),
      boundary,
      tool("c"),
    ]);
    assert.deepEqual(
      parts.map((item) => item.kind),
      ["activity", "part", "activity"]
    );
    assert.equal(parts[1].kind === "part" && parts[1].part, boundary);
    assert.equal(
      groupActivityMessages([
        message("a", [tool("a")]),
        message("mixed", [boundary, tool("b")]),
        message("c", [tool("c")]),
      ]).length,
      3
    );
  }
});

test("summary reports real counts and pending approval takes priority over success and errors", () => {
  const summary = activitySummary(
    [
      tool("ok"),
      tool("fail", "output-error"),
      tool("pending", "approval-requested", { approval: { id: "approval-a" } }),
    ],
    true
  );
  assert.equal(summary.count, 3);
  assert.equal(summary.state, "approval-requested");
  assert.equal(summary.label, "等待确认");
  assert.equal(
    activitySummary([tool("active", "input-available")], true).state,
    "input-available"
  );
  assert.equal(
    activitySummary([tool("stale", "input-available")], false).state,
    "output-error"
  );
  assert.equal(
    activitySummary([
      tool("denied", "approval-responded", {
        approval: { approved: false, id: "a" },
      }),
    ]).state,
    "output-denied"
  );
});

test("new attention event IDs reopen even when aggregate state is unchanged; rerenders preserve choices", () => {
  for (const state of ["approval-requested", "output-error", "output-denied"]) {
    const a = tool("a", state, { approval: { id: "approval-a" } });
    let current = initialActivityDisclosure(activitySummary([a]));
    assert.equal(current.open, true);
    current = { ...current, open: false };
    assert.equal(
      reconcileActivityDisclosure(current, activitySummary([a])),
      current
    );
    const appended = activitySummary([
      a,
      tool("b", state, { approval: { id: "approval-b" } }),
    ]);
    current = reconcileActivityDisclosure(current, appended);
    assert.equal(current.open, true);
    current = { ...current, open: false };
    assert.equal(reconcileActivityDisclosure(current, appended), current);
    assert.equal(
      reconcileActivityDisclosure(current, activitySummary([tool("a")])).open,
      false
    );
    assert.equal(
      reconcileActivityDisclosure(
        current,
        activitySummary([tool("active", "input-available")], true)
      ).open,
      true
    );
  }
});

test("a replacement approval ID on the same call is a new attention event", () => {
  const a = tool("same-call", "approval-requested", {
    approval: { id: "first" },
  });
  const current = {
    ...initialActivityDisclosure(activitySummary([a])),
    open: false,
  };
  const next = tool("same-call", "approval-requested", {
    approval: { id: "second" },
  });
  assert.equal(
    reconcileActivityDisclosure(current, activitySummary([next])).open,
    true
  );
});

test("idle unfinished calls do not invent a returned failure or continued execution", () => {
  assert.equal(
    activitySummary([tool("unfinished", "input-available")]).label,
    "未完成"
  );
  const acknowledged = activitySummary([
    tool("ack", "approval-responded", {
      approval: { approved: true, id: "ack" },
    }),
  ]);
  assert.equal(acknowledged.active, false);
  assert.equal(acknowledged.label, "未完成");
  assert.equal(acknowledged.state, "output-error");
  const active = activitySummary(
    [
      tool("ack", "approval-responded", {
        approval: { approved: true, id: "ack" },
      }),
    ],
    true
  );
  assert.equal(active.active, true);
  assert.equal(active.state, "approval-responded");
  assert.equal(active.label, "执行中");
});

test("real SDK empty-text and transport metadata do not split read and search before a table artifact", () => {
  const read = {
    ...tool("read"),
    type: "tool-readAttachment",
  } as unknown as ChatMessage["parts"][number];
  const search = tool("search");
  const artifact = {
    ...tool("table"),
    type: "tool-createResultTable",
  } as ChatMessage["parts"][number];
  const parts = [
    { type: "step-start" },
    { text: "", type: "text" },
    read,
    { type: "step-start" },
    { text: "  ", type: "text" },
    search,
    { data: "fixture title", type: "data-chat-title" },
    { data: { toolCallId: "search" }, type: "data-mcp-source" },
    { type: "step-start" },
    { text: "", type: "text" },
    artifact,
    { data: {}, type: "data-resultTable" },
    { type: "step-start" },
    { text: "final answer", type: "text" },
  ] as ChatMessage["parts"];
  const snapshot = JSON.stringify(parts);
  const groups = groupActivityParts(parts);
  assert.deepEqual(
    groups.map((group) => group.kind),
    ["activity", "part", "part"]
  );
  assert.equal(groups[0].kind === "activity" && groups[0].parts.length, 2);
  assert.equal(groups[1].kind === "part" && groups[1].part, artifact);
  assert.equal(groups[2].kind === "part" && groups[2].part, parts.at(-1));
  const groupedMessages = groupActivityMessages([
    message("read", parts.slice(0, 3)),
    message("search", parts.slice(3, 8)),
  ]);
  assert.equal(groupedMessages.length, 1);
  assert.equal(JSON.stringify(parts), snapshot);
});

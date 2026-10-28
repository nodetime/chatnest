import assert from "node:assert/strict";
import test from "node:test";
import { convertToModelMessages } from "ai";
import { projectSettledToolHistory } from "./message-turn";

const projection = () => {
  assert.equal(
    typeof projectSettledToolHistory,
    "function",
    "normal follow-ups must project unfinished historical approvals out of model context"
  );
  return projectSettledToolHistory;
};
const pending = (id: string) => ({
  approval: { approved: true, id: `approve-${id}` },
  input: { q: "sample" },
  state: "approval-responded",
  toolCallId: id,
  toolName: "provider_search",
  type: "dynamic-tool",
});

test("ordinary user continuation cannot replay an approved unfinished historical call", async () => {
  const history = [
    {
      id: "a",
      parts: [{ text: "Searching", type: "text" }, pending("old")],
      role: "assistant",
    },
    { id: "u", parts: [{ text: "Continue", type: "text" }], role: "user" },
  ];
  const before = JSON.stringify(history);
  const projected = projection()(history);
  const messages = await convertToModelMessages(projected as never, {
    ignoreIncompleteToolCalls: true,
  });
  assert.doesNotMatch(JSON.stringify(messages), /approve-old|toolCallId.*old/);
  assert.match(JSON.stringify(messages), /Searching|Continue/);
  assert.equal(
    JSON.stringify(history),
    before,
    "original approval/audit history must remain unchanged"
  );
});

test("only the current approval turn survives; older incomplete calls are not reauthorized", () => {
  const history = [
    { id: "old", parts: [pending("old-call")], role: "assistant" },
    { id: "u", parts: [{ text: "New task", type: "text" }], role: "user" },
    { id: "latest", parts: [pending("new-call")], role: "assistant" },
  ];
  const projected = projection()(history, "latest");
  assert.equal(projected[0].parts.length, 0);
  assert.deepEqual(projected[2].parts, history[2].parts);
});

test("settled successes, failures, denials and native progress remain in history", () => {
  const parts = [
    {
      input: { items: [] },
      output: { items: [] },
      state: "output-available",
      toolCallId: "todo",
      type: "tool-updateTodo",
    },
    ...["output-available", "output-error", "output-denied"].map(
      (state, i) => ({
        ...pending(`done-${i}`),
        errorText: "Failed",
        output: { value: i },
        state,
      })
    ),
  ];
  assert.deepEqual(
    projection()([{ id: "a", parts, role: "assistant" }])[0].parts,
    parts
  );
});

test("resolved attachment parts pass through unchanged before model conversion", () => {
  const parts = [
    { text: "Registered private attachment context", type: "text" },
    {
      mediaType: "application/pdf",
      type: "file",
      url: "data:application/pdf;base64,c2FtcGxl",
    },
    {
      mediaType: "image/png",
      type: "file",
      url: "data:image/png;base64,c2FtcGxl",
    },
  ];
  assert.deepEqual(
    projectSettledToolHistory([{ id: "user", parts, role: "user" }])[0].parts,
    parts
  );
});

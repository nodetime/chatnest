import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareRegeneration } from "@/server/agent/message-turn";
import type { ChatMessage } from "@/server/domain/message/types";

const question: ChatMessage = {
  id: "question",
  parts: [{ text: "Stored question", type: "text" }],
  role: "user",
};
const answer: ChatMessage = {
  id: "answer",
  parts: [{ text: "Original answer", type: "text" }],
  role: "assistant",
};

test("regeneration reuses the stored question and excludes the old answer", () => {
  const result = prepareRegeneration([question, answer], question.id);
  assert.deepEqual(result, { answerId: answer.id, context: [question] });
});

test("only the latest answered user turn can be regenerated", () => {
  const next = { ...question, id: "next" };
  assert.equal(
    prepareRegeneration([question, answer, next], question.id),
    null
  );
  assert.equal(prepareRegeneration([question], question.id), null);
  assert.equal(prepareRegeneration([question, answer], "tampered-id"), null);
});

test("regeneration cannot discard a pending tool approval", () => {
  const pending = {
    ...answer,
    parts: [
      {
        approval: { id: "approval" },
        input: {},
        state: "approval-requested",
        toolCallId: "call",
        toolName: "search",
        type: "dynamic-tool",
      },
    ],
  } as ChatMessage;
  assert.equal(prepareRegeneration([question, pending], question.id), null);
});
test("editing uses stored file refs, replaces only text, and retains original history until commit", async () => {
  const { prepareMessageEdit } = await import("@/server/agent/message-turn");
  const file = {
    mediaType: "image/png",
    type: "file" as const,
    url: "/api/files/11111111-1111-4111-8111-111111111111",
  };
  const original = { ...question, parts: [file, ...question.parts] };
  const stored = [original, answer, { ...question, id: "later" }];
  const edit = prepareMessageEdit(stored, question.id, "Changed text");
  assert.ok(edit);
  assert.deepEqual(edit.context, [
    { ...original, parts: [file, { text: "Changed text", type: "text" }] },
  ]);
  assert.deepEqual(stored[0], original);
  assert.equal(prepareMessageEdit(stored, answer.id, "x"), null);
  assert.equal(prepareMessageEdit(stored, "missing", "x"), null);
  assert.equal(prepareMessageEdit(stored, question.id, "  "), null);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { wrapModelWithBilling } from "@/server/application/chat/model-billing";

test("model billing wraps one provider request and groups it as a session step", async () => {
  const events: string[] = [];
  const model = wrapModelWithBilling(
    new MockLanguageModelV4({
      doGenerate: {
        content: [{ text: "ok", type: "text" }],
        finishReason: { raw: "stop", unified: "stop" },
        usage: {
          inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
          outputTokens: { reasoning: 0, text: 1, total: 1 },
        },
        warnings: [],
      },
    }),
    {
      chatId: "chat-1",
      client: {
        dispatch: () => {
          events.push("dispatch");
          return Promise.resolve({ permit: "permit" });
        },
        report: ({ outcome }) => {
          events.push(`report:${outcome}`);
          return Promise.resolve();
        },
        reserve: (input) => {
          events.push(`reserve:${input.sessionGroupId}:${input.subjectType}`);
          return Promise.resolve({ holdId: "hold", reservedPoints: "3" });
        },
      },
      modelId: "chat-model",
      repository: {
        claimSending: () => {
          events.push("sending");
          return Promise.resolve(true);
        },
        createOperation: (input) => {
          events.push(`create:${input.subjectType}:${input.sessionGroupId}`);
          return Promise.resolve();
        },
        enqueueSettlement: () => Promise.resolve(),
        saveReceipt: () => Promise.resolve(),
      },
      runId: "run-1",
      stepIndex: () => 0,
      userId: "user-1",
    }
  );

  const result = await generateText({ model, prompt: "hello" });
  assert.equal(result.text, "ok");
  assert.deepEqual(events, [
    "create:model:chat-1",
    "reserve:chat-1:model",
    "dispatch",
    "sending",
    "report:response",
  ]);
});

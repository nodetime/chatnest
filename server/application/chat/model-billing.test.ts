import assert from "node:assert/strict";
import { test } from "node:test";
import { generateText, streamText } from "ai";
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

test("model billing marks the local operation settled after platform report", async () => {
  let settledOperationId: string | undefined;
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
      chatId: "chat-local-settlement",
      client: {
        dispatch: () => Promise.resolve({ permit: "permit" }),
        report: () => Promise.resolve(),
        reserve: () => Promise.resolve({ holdId: "hold", reservedPoints: "3" }),
      },
      modelId: "chat-model",
      repository: {
        claimSending: () => Promise.resolve(true),
        createOperation: () => Promise.resolve(),
        enqueueSettlement: () => Promise.resolve(),
        markSettled: ({ operationId }) => {
          settledOperationId = operationId;
          return Promise.resolve();
        },
        saveReceipt: () => Promise.resolve(),
      },
      runId: "run-local-settlement",
      stepIndex: () => 0,
      userId: "user-local-settlement",
    }
  );

  await generateText({ model, prompt: "hello" });
  assert.ok(settledOperationId);
});

test("model billing does not report an unknown outcome after settlement enqueue", async () => {
  const reports: string[] = [];
  let enqueued = 0;
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
      chatId: "chat-report-failure",
      client: {
        dispatch: () => Promise.resolve({ permit: "permit" }),
        report: ({ outcome }) => {
          reports.push(outcome);
          return Promise.reject(new Error("platform unavailable"));
        },
        reserve: () => Promise.resolve({ holdId: "hold", reservedPoints: "3" }),
      },
      modelId: "chat-model",
      repository: {
        claimSending: () => Promise.resolve(true),
        createOperation: () => Promise.resolve(),
        enqueueSettlement: () => {
          enqueued += 1;
          return Promise.resolve();
        },
        saveReceipt: () => Promise.resolve(),
      },
      runId: "run-report-failure",
      stepIndex: () => 0,
      userId: "user-report-failure",
    }
  );

  await assert.rejects(() => generateText({ model, prompt: "hello" }));
  assert.deepEqual(reports, ["response"]);
  assert.equal(enqueued, 1);
});

test("model billing reports usage from AI SDK finish-step streams", async () => {
  const reports: unknown[] = [];
  const model = wrapModelWithBilling(
    new MockLanguageModelV4({
      doStream: {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ id: "text-1", type: "text-start" });
            controller.enqueue({
              delta: "ok",
              id: "text-1",
              type: "text-delta",
            });
            controller.enqueue({ id: "text-1", type: "text-end" });
            controller.enqueue({
              finishReason: { raw: "stop", unified: "stop" },
              type: "finish",
              usage: {
                inputTokens: {
                  cacheRead: 0,
                  cacheWrite: 0,
                  noCache: 12,
                  total: 12,
                },
                outputTokens: { reasoning: 0, text: 7, total: 7 },
              },
            });
            controller.close();
          },
        }),
      },
    }),
    {
      chatId: "chat-stream-usage",
      client: {
        dispatch: () => Promise.resolve({ permit: "permit" }),
        report: (input) => {
          reports.push(input);
          return Promise.resolve();
        },
        reserve: () => Promise.resolve({ holdId: "hold", reservedPoints: "3" }),
      },
      modelId: "chat-model",
      repository: {
        claimSending: () => Promise.resolve(true),
        createOperation: () => Promise.resolve(),
        enqueueSettlement: () => Promise.resolve(),
        saveReceipt: () => Promise.resolve(),
      },
      runId: "run-stream-usage",
      stepIndex: () => 0,
      userId: "user-stream-usage",
    }
  );

  const result = streamText({ model, prompt: "hello" });
  assert.equal(await result.text, "ok");
  assert.deepEqual(reports, [
    {
      attemptId: reports[0] && (reports[0] as { attemptId: string }).attemptId,
      operationId:
        reports[0] && (reports[0] as { operationId: string }).operationId,
      outcome: "response",
      usage: { inputTokens: 12, outputTokens: 7 },
    },
  ]);
});

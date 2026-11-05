import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateText, streamText } from "ai";
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
    "sending",
    "reserve:chat-1:model",
    "dispatch",
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

test("one billed turn reports a provider 429 once as a known failure without SDK retry", async () => {
  let calls = 0;
  let reservations = 0;
  const reports: string[] = [];
  const model = wrapModelWithBilling(
    new MockLanguageModelV4({
      doStream: () => {
        calls += 1;
        return Promise.reject(
          new APICallError({
            message: "rate limited",
            requestBodyValues: undefined,
            statusCode: 429,
            url: "https://gateway.invalid/v1/responses",
          })
        );
      },
    }),
    {
      chatId: "chat-rate-limit",
      client: {
        dispatch: () => Promise.resolve({ permit: "permit" }),
        report: ({ outcome }) => {
          reports.push(outcome);
          return Promise.resolve();
        },
        reserve: () => {
          reservations += 1;
          return Promise.resolve({ holdId: "hold", reservedPoints: "2" });
        },
      },
      modelId: "chat-model",
      repository: {
        claimSending: () => Promise.resolve(true),
        createOperation: () => Promise.resolve(),
        enqueueSettlement: () => Promise.resolve(),
        saveReceipt: () => Promise.resolve(),
      },
      runId: "run-rate-limit",
      stepIndex: () => 0,
      userId: "user-rate-limit",
    }
  );

  let streamError: unknown;
  const result = streamText({
    model,
    onError({ error }) {
      streamError = error;
    },
    prompt: "hello",
  });
  for await (const _part of result.fullStream) {
    // Drain the SDK stream to observe its default retry behavior.
  }
  assert.equal(calls, 1);
  assert.equal(reservations, 1);
  assert.deepEqual(reports, ["failed"]);
  assert.ok(APICallError.isInstance(streamError));
  assert.equal(streamError.statusCode, 429);
  assert.equal(streamError.isRetryable, false);
});

function billingFailureFixture() {
  const reports: unknown[] = [];
  const queued: unknown[] = [];
  const options = {
    chatId: "failure-chat",
    client: {
      dispatch: async () => ({ permit: "permit" }),
      report: (input: unknown) => {
        reports.push(input);
        return Promise.resolve();
      },
      reportInternal: (input: unknown) => {
        reports.push(input);
        return Promise.resolve();
      },
      reserve: async () => ({ holdId: "hold", reservedPoints: "3" }),
    },
    modelId: "fixture",
    repository: {
      claimSending: async () => true,
      createOperation: async () => undefined,
      enqueueSettlement: (input: unknown) => {
        queued.push(input);
        return Promise.resolve();
      },
      saveReceipt: async () => undefined,
    },
    runId: "failure-run",
    stepIndex: () => 0,
    userId: "failure-user",
  };
  return { options, queued, reports };
}

test("a dispatch failure queues release of the same unstarted model attempt", async () => {
  const { options, queued } = billingFailureFixture();
  let ids: { attemptId: string; operationId: string } | undefined;
  options.client.dispatch = () =>
    Promise.reject(new Error("dispatch unavailable"));
  options.client.reportInternal = () =>
    Promise.reject(new Error("report unavailable"));
  const model = wrapModelWithBilling(
    new MockLanguageModelV4({
      doStream: async () => assert.fail("upstream called"),
    }),
    {
      ...options,
      repository: {
        ...options.repository,
        createOperation: (input) => {
          ids = { attemptId: input.attemptId, operationId: input.operationId };
          return Promise.resolve();
        },
      },
    }
  );
  await assert.rejects(
    Promise.resolve(model.doStream({ prompt: [] })),
    /dispatch unavailable/
  );
  assert.ok(ids);
  assert.deepEqual(queued, [
    {
      command: "report",
      idempotencyKey: `${ids.operationId}:report`,
      operationId: ids.operationId,
      payload: { ...ids, outcome: "not_dispatched" },
    },
  ]);
});

for (const mode of [
  "read-error",
  "error-frame",
  "cancel",
  "eof",
  "finish-then-error",
  "finish-then-cancel",
] as const) {
  test(`an interrupted model stream reports unknown once: ${mode}`, async () => {
    const { options, reports } = billingFailureFixture();
    const err = new Error("upstream stream error");
    let upstreamCancelled = false;
    let finishSent = false;
    const model = wrapModelWithBilling(
      new MockLanguageModelV4({
        doStream: {
          stream: new ReadableStream(
            {
              cancel() {
                upstreamCancelled = true;
              },
              pull(controller) {
                if (mode.startsWith("finish-")) {
                  if (finishSent) {
                    controller.error(err);
                  } else {
                    finishSent = true;
                    controller.enqueue({
                      finishReason: { raw: "stop", unified: "stop" },
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
                  return;
                }
                if (mode === "read-error") {
                  controller.error(err);
                }
                if (mode === "error-frame") {
                  controller.enqueue({ error: err, type: "error" });
                  controller.close();
                }
                if (mode === "eof") {
                  controller.close();
                }
              },
            },
            { highWaterMark: 0 }
          ),
        },
      }),
      options
    );
    const reader = (await model.doStream({ prompt: [] })).stream.getReader();
    if (mode.startsWith("finish-")) {
      assert.equal((await reader.read()).value?.type, "finish");
    }
    if (mode === "read-error" || mode === "finish-then-error") {
      await assert.rejects(reader.read(), err);
    } else if (mode === "cancel" || mode === "finish-then-cancel") {
      await reader.cancel();
      assert.equal(upstreamCancelled, true);
    } else {
      if (mode === "error-frame") {
        assert.equal((await reader.read()).value?.type, "error");
      }
      assert.equal((await reader.read()).done, true);
    }
    assert.deepEqual(
      reports.map((r) => (r as { outcome: string }).outcome),
      ["unknown"],
      mode
    );
  });
}

test("OpenAI EOF without a provider finish reason is not successful billing", async () => {
  const { options, reports } = billingFailureFixture();
  const frame = JSON.stringify({
    choices: [
      {
        delta: { content: "partial", role: "assistant" },
        finish_reason: null,
        index: 0,
      },
    ],
    created: 1_700_000_000,
    id: "fixture",
    model: "fixture",
    object: "chat.completion.chunk",
  });
  const provider = createOpenAI({
    apiKey: "fixture",
    baseURL: "http://127.0.0.1:1/v1",
    fetch: () =>
      Promise.resolve(
        new Response(`data: ${frame}\n\n`, {
          headers: { "content-type": "text/event-stream" },
        })
      ),
  });
  const model = wrapModelWithBilling(provider.chat("fixture"), options);
  const { stream } = await model.doStream({ prompt: [] });
  await stream.pipeTo(new WritableStream());
  assert.equal((reports[0] as { outcome: string }).outcome, "unknown");
  assert.equal(reports.length, 1);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  convertToModelMessages,
  createUIMessageStream,
  readUIMessageStream,
} from "ai";
import {
  createRunFailureReporter,
  hasRunFailure,
} from "../../lib/agent/run-failure";
import type { ChatMessage } from "../../lib/types";

test("actual SDK persists a sanitized failure marker without inventing model text", async () => {
  const failure = createRunFailureReporter();
  let persisted: ChatMessage | undefined;
  const stream = createUIMessageStream<ChatMessage>({
    execute: ({ writer }) => {
      failure.report((part) => writer.write(part));
      failure.report((part) => writer.write(part));
      throw new Error(
        "private provider body, token and endpoint must not be persisted"
      );
    },
    onEnd: ({ responseMessage }) => {
      persisted = responseMessage;
    },
    onError: () => "Request failed",
  });
  for await (const _message of readUIMessageStream({
    onError: () => undefined,
    stream,
  })) {
    // Consume the actual SDK lifecycle, including onEnd.
  }
  assert.ok(failure.failed);
  assert.ok(persisted);
  assert.equal(persisted.parts.length, 1);
  assert.equal(hasRunFailure(persisted), true);
  assert.doesNotMatch(
    JSON.stringify(persisted),
    /private provider|token|endpoint/
  );
  const model = await convertToModelMessages([persisted]);
  assert.doesNotMatch(
    JSON.stringify(model),
    /run-status|failed|Request failed/
  );
  assert.equal(hasRunFailure({ ...persisted, parts: [] }), false);
  assert.equal(hasRunFailure({ ...persisted, role: "user" }), false);
});

test("approval continuation updates only platform status, preserves tool evidence, and can fail again", async () => {
  const old: ChatMessage = {
    id: "same-assistant",
    parts: [
      { data: { state: "failed" }, id: "run-status", type: "data-run-status" },
      {
        approval: { approved: true, id: "same-approval" },
        input: { q: "original" },
        state: "approval-responded",
        toolCallId: "same-call",
        toolName: "porta__example",
        type: "dynamic-tool",
      },
    ],
    role: "assistant",
  };
  const snapshot = structuredClone(old);
  await Promise.all(
    [false, true].map(async (failAgain) => {
      const reporter = createRunFailureReporter();
      let persisted: ChatMessage | undefined;
      const stream = createUIMessageStream<ChatMessage>({
        execute: ({ writer }) => {
          writer.write({
            data: { state: "resumed" },
            id: "run-status",
            type: "data-run-status",
          });
          if (failAgain) {
            reporter.report((part) => writer.write(part));
          }
        },
        onEnd: ({ responseMessage }) => {
          persisted = responseMessage;
        },
        originalMessages: [old],
      });
      for await (const _ of readUIMessageStream({
        message: structuredClone(old),
        stream,
      })) {
        /* Consume SDK */
      }
      assert.ok(persisted);
      assert.equal(persisted.id, old.id);
      assert.equal(hasRunFailure(persisted), failAgain);
      assert.equal(
        persisted.parts.filter((part) => part.type === "data-run-status")
          .length,
        1
      );
      assert.deepEqual(
        persisted.parts.find((part) => part.type === "dynamic-tool"),
        old.parts[1]
      );
      assert.deepEqual(old, snapshot);
    })
  );
});

test("SDK runtime timeout after a successful tool step is durable failure; explicit user stop is not", async () => {
  const { streamText, toUIMessageStream, jsonSchema, isStepCount } =
    await import("ai");
  const { MockLanguageModelV4 } = await import("ai/test");
  await Promise.all(
    [false, true].map(async (userStop) => {
      const request = new AbortController();
      const deadline = new AbortController();
      const reporter = createRunFailureReporter();
      let step = 0;
      let aborted = 0;
      let modelErrors = 0;
      let persisted: ChatMessage | undefined;
      const model = new MockLanguageModelV4({
        // biome-ignore lint/suspicious/useAwait: Match the SDK asynchronous transport boundary without network I/O.
        doStream: async () => {
          step += 1;
          if (step === 1) {
            return {
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue({ type: "stream-start", warnings: [] });
                  controller.enqueue({
                    input: "{}",
                    toolCallId: "original-call",
                    toolName: "test",
                    type: "tool-call",
                  });
                  controller.enqueue({
                    finishReason: { raw: "tool_calls", unified: "tool-calls" },
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
                  controller.close();
                },
              }),
            };
          }
          return {
            stream: new ReadableStream({
              start(controller) {
                setTimeout(() => {
                  (userStop ? request : deadline).abort();
                  controller.error(new DOMException("aborted", "AbortError"));
                }, 5);
              },
            }),
          };
        },
      });
      const stream = createUIMessageStream<ChatMessage>({
        execute: async ({ writer }) => {
          const result = streamText({
            abortSignal: AbortSignal.any([request.signal, deadline.signal]),
            model,
            onAbort() {
              aborted += 1;
              if (!request.signal.aborted) {
                reporter.report((part) => writer.write(part));
              }
            },
            onError() {
              modelErrors += 1;
            },
            prompt: "test",
            stopWhen: isStepCount(3),
            tools: {
              test: {
                execute: async () => "original result",
                inputSchema: jsonSchema({ properties: {}, type: "object" }),
              },
            },
          });
          writer.merge(toUIMessageStream({ stream: result.stream }));
          await result.text;
        },
        onEnd: ({ responseMessage }) => {
          persisted = responseMessage;
        },
      });
      for await (const _ of readUIMessageStream({
        onError: () => undefined,
        stream,
      })) {
        /* consume */
      }
      assert.ok(persisted);
      assert.equal(aborted, 1);
      assert.equal(modelErrors, 0);
      assert.equal(hasRunFailure(persisted), !userStop);
      assert.ok(JSON.stringify(persisted).includes("original result"));
    })
  );
});

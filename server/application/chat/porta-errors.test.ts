import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { MCPClient } from "@ai-sdk/mcp";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import {
  jsonSchema,
  readUIMessageStream,
  streamText,
  toUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createAgentRuntime } from "@/server/agent/runtime";

const serviceToken = "fixture-porta-service-token-32";
const toolName = "porta__onebound_1688_item_search";

async function withErrorRuntime(
  run: (
    runtime: Awaited<ReturnType<typeof createAgentRuntime>>,
    setOutput: (output: unknown) => void,
    count: () => number
  ) => Promise<void>
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "porta-errors-"));
  const previous = process.env.AGENT_CONFIG_PATH;
  let output: unknown;
  let calls = 0;
  let runtime: Awaited<ReturnType<typeof createAgentRuntime>> | undefined;
  try {
    const filename = path.join(root, "agent.json");
    await writeFile(
      filename,
      JSON.stringify({
        servers: [
          {
            allowedTools: ["onebound_1688_item_search"],
            headers: { Authorization: `Bearer ${serviceToken}` },
            id: "porta",
            name: "Porta",
            url: "https://fixture.example/mcp",
          },
        ],
      })
    );
    process.env.AGENT_CONFIG_PATH = filename;
    runtime = await createAgentRuntime(new AbortController().signal, () =>
      Promise.resolve({
        close: async () => undefined,
        tools: async () => ({
          onebound_1688_item_search: {
            execute: () => {
              calls += 1;
              return output;
            },
            inputSchema: jsonSchema({
              properties: { q: { type: "string" } },
              required: ["q"],
              type: "object",
            }),
          },
        }),
      } as unknown as MCPClient)
    );
    await run(
      runtime,
      (value) => {
        output = value;
      },
      () => calls
    );
  } finally {
    await runtime?.close();
    if (previous === undefined) {
      delete process.env.AGENT_CONFIG_PATH;
    } else {
      process.env.AGENT_CONFIG_PATH = previous;
    }
    await rm(root, { force: true, recursive: true });
  }
}

function result(body: unknown, isError: boolean) {
  return {
    _meta: { porta: { httpStatus: 200, requestId: "fixture" } },
    content: [{ text: JSON.stringify(body), type: "text" }],
    isError,
    structuredContent: body,
  };
}

test("Porta success, 0000 and chargeable no-results 2000 preserve the native MCP result", async () => {
  await withErrorRuntime(async (runtime, setOutput, count) => {
    const { execute } = runtime.tools[toolName];
    assert.ok(execute);
    for (const [caseIndex, body] of [
      { items: { item: [] } },
      { error: "", error_code: "0000", items: { item: [null] } },
      { error: "No result", error_code: "2000", items: { item: [] } },
    ].entries()) {
      const output = result(body, false);
      setOutput(output);
      assert.equal(
        // biome-ignore lint/performance/noAwaitInLoops: each case uses a distinct injected response
        await execute(
          { q: "fixture" },
          {
            context: {},
            messages: [],
            toolCallId: `native-success-${caseIndex}`,
          }
        ),
        output
      );
    }
    assert.equal(count(), 3);
  });
});

test("Porta error 4008 and BridgeError retain JSON bodies without headers, leaked service tokens or retry advice", async () => {
  await withErrorRuntime(async (runtime, setOutput, count) => {
    const { execute } = runtime.tools[toolName];
    assert.ok(execute);
    const bodies = [
      {
        call_args: { key: "[REDACTED]" },
        error: "Permission denied",
        error_code: "4008",
        extra: { fixture: true },
        item: null,
      },
      {
        porta_error: {
          code: "provider_not_configured",
          message: "Service unavailable",
        },
      },
    ];
    for (const [caseIndex, body] of bodies.entries()) {
      setOutput({
        ...result(body, true),
        _meta: {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
            "Set-Cookie": "private-cookie-fixture",
          },
        },
      });
      // biome-ignore lint/performance/noAwaitInLoops: sequential fixture cases avoid sharing mutable remote output
      await assert.rejects(
        () =>
          Promise.resolve(
            execute(
              { q: "fixture" },
              {
                context: {},
                messages: [],
                toolCallId: `native-error-${caseIndex}`,
              }
            )
          ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.ok(
            error.message.includes(JSON.stringify(body)),
            "the original JSON error body must be retained"
          );
          assert.deepEqual(
            JSON.parse(error.message.split("\n").at(-1) ?? ""),
            body
          );
          assert.match(error.message, /不自动重试/);
          assert.ok(!error.message.includes("稍后重试"));
          assert.ok(!error.message.includes(serviceToken));
          assert.ok(!error.message.includes("private-cookie-fixture"));
          return true;
        }
      );
    }
    assert.equal(count(), 2);
    setOutput(
      result(
        { echoed_token: serviceToken, error: "Denied", error_code: "4008" },
        true
      )
    );
    await assert.rejects(
      () =>
        Promise.resolve(
          execute(
            { q: "fixture" },
            { context: {}, messages: [], toolCallId: "echo-error" }
          )
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(!error.message.includes(serviceToken));
        assert.match(error.message, /\[REDACTED\]/);
        return true;
      }
    );
    assert.equal(count(), 3);
  });
});

test("real AI SDK stream exposes only branded Porta error text as tool-output-error, never tool success", async () => {
  const implementation = await import(
    "@/server/domain/message/porta-error"
  ).catch(() => null);
  assert.ok(
    implementation,
    "Porta-specific safe stream error formatter is required"
  );
  assert.equal(
    implementation.agentStreamErrorText(
      new Error(`untrusted error ${serviceToken}`)
    ),
    "An error occurred."
  );
  // P2:流编排迁 application/chat/send-message.ts
  const chatUseCase = await readFile(
    "server/application/chat/send-message.ts",
    "utf8"
  );
  assert.match(chatUseCase, /onError: agentStreamErrorText/);
  await withErrorRuntime(async (runtime, setOutput, count) => {
    setOutput(
      result(
        { error: "Permission denied", error_code: "4008", item: null },
        true
      )
    );
    const chunks: LanguageModelV4StreamPart[] = [
      { type: "stream-start", warnings: [] },
      {
        input: '{"q":"fixture"}',
        toolCallId: "error-fixture",
        toolName,
        type: "tool-call",
      },
      {
        finishReason: { raw: "tool_calls", unified: "tool-calls" },
        type: "finish",
        usage: {
          inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
          outputTokens: { reasoning: 0, text: 1, total: 1 },
        },
      },
    ];
    const model = new MockLanguageModelV4({
      doStream: {
        stream: new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          },
        }),
      },
    });
    // Confirmation policy is asserted separately; this fixture models an approved call.
    const modelResult = streamText({
      model,
      prompt: "Fixture-only tool error",
      tools: {
        [toolName]: { ...runtime.tools[toolName], needsApproval: false },
      },
    });
    const events: UIMessageChunk[] = [];
    await toUIMessageStream({
      onError: implementation.agentStreamErrorText,
      stream: modelResult.stream,
    }).pipeTo(
      new WritableStream({
        write(event) {
          events.push(event);
        },
      })
    );
    const failed = events.find((event) => event.type === "tool-output-error");
    assert.ok(failed && failed.type === "tool-output-error");
    assert.match(failed.errorText, /4008/);
    assert.match(failed.errorText, /Permission denied/);
    assert.ok(!JSON.stringify(events).includes(serviceToken));
    assert.ok(!events.some((event) => event.type === "tool-output-available"));
    assert.equal(count(), 1);
    let message: UIMessage | undefined;
    const replay = new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(event);
        }
        controller.close();
      },
    });
    for await (const current of readUIMessageStream({
      stream: replay,
      terminateOnError: true,
    })) {
      message = current;
    }
    const toolPart = message?.parts.find(
      (part) => part.type === "dynamic-tool"
    );
    assert.ok(toolPart?.type === "dynamic-tool");
    assert.equal(toolPart.state, "output-error");
    assert.match(toolPart.errorText ?? "", /4008/);
  });
});

test("Porta header fallback redacts dynamic JSON keys and fails explicitly on redaction collisions", async () => {
  await withErrorRuntime(async (runtime, setOutput) => {
    const { execute } = runtime.tools[toolName];
    assert.ok(execute);
    setOutput(
      result({ error_code: "4008", [serviceToken]: { keep: true } }, true)
    );
    await assert.rejects(
      () =>
        Promise.resolve(
          execute(
            { q: "fixture" },
            { context: {}, messages: [], toolCallId: "dynamic-key" }
          )
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(
          !error.message.includes(serviceToken),
          "header token in an object key must not leak"
        );
        assert.deepEqual(JSON.parse(error.message.split("\n").at(-1) ?? ""), {
          "[REDACTED]": { keep: true },
          error_code: "4008",
        });
        return true;
      }
    );
    setOutput(
      result({ error_code: "4008", [serviceToken]: 1, "[REDACTED]": 2 }, true)
    );
    await assert.rejects(
      () =>
        Promise.resolve(
          execute(
            { q: "fixture" },
            { context: {}, messages: [], toolCallId: "colliding-keys" }
          )
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(!error.message.includes(serviceToken));
        assert.deepEqual(JSON.parse(error.message.split("\n").at(-1) ?? ""), {
          porta_error: { code: "error_redaction_collision" },
        });
        return true;
      }
    );
  });
});

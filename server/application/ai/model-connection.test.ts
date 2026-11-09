import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  convertToModelMessages,
  generateText,
  isStepCount,
  readUIMessageStream,
  streamText,
  tool,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { runWithModelEnvironment } from "./model-context";
import { completionStepSettings } from "./prompts";

test("an OpenAI key and custom endpoint select direct access without a gateway key", async () => {
  const implementation = await import(
    "@/server/application/ai/model-connection"
  ).catch(() => null);
  assert.ok(implementation, "direct model connection configuration is missing");
  const connection = implementation.getModelConnection({
    OPENAI_API_KEY: "test-only-key",
    OPENAI_BASE_URL: "http://127.0.0.1:8123/custom/v1/",
    OPENAI_MODEL: "vendor/custom-model",
  });
  assert.equal(connection.provider, "openai");
  assert.equal(connection.configured, true);
  assert.equal(connection.baseURL, "http://127.0.0.1:8123/custom/v1");
  assert.equal(connection.modelId, "vendor/custom-model");
  assert.equal(connection.apiMode, "chat");
  assert.equal("apiKey" in connection, false);
  assert.equal(
    implementation.getModelConnection({ MODEL_PROVIDER: "openai" }).configured,
    false
  );
  assert.equal(
    implementation.getModelConnection({
      AI_GATEWAY_API_KEY: "gateway-only",
      MODEL_PROVIDER: "openai",
    }).configured,
    false
  );
  assert.equal(
    implementation.getModelConnection({
      AI_GATEWAY_API_KEY: "gateway-only",
      MODEL_PROVIDER: "gateway",
      OPENAI_API_KEY: "direct-only",
    }).provider,
    "gateway"
  );
  for (const url of [
    "file:///etc/passwd",
    "https://user:pass@example.com/v1",
    "https://example.com/v1?key=secret",
    "https://example.com/v1/chat/completions",
  ]) {
    assert.throws(
      () => implementation.getModelConnection({ OPENAI_BASE_URL: url }),
      /OPENAI_BASE_URL/
    );
  }
});

test("custom model catalog and capabilities do not query Vercel's gateway", async () => {
  const implementation = await import(
    "@/server/application/ai/model-connection"
  ).catch(() => null);
  assert.ok(implementation, "direct model connection configuration is missing");
  const env = {
    MODEL_PROVIDER: "openai",
    OPENAI_MODEL: "custom-research",
    OPENAI_MODEL_TOOLS: "0",
    OPENAI_MODEL_VISION: "1",
  };
  assert.deepEqual(
    implementation.getRuntimeModels(env).map((model) => model.id),
    ["custom-research"]
  );
  assert.equal(
    implementation.resolveModelId("moonshotai/kimi-k2.5", env),
    "custom-research"
  );
  assert.deepEqual(implementation.getDirectCapabilities(env), {
    "custom-research": { reasoning: false, tools: false, vision: true },
  });
});

test("DeepSeek adapter selection is limited to its configured HTTPS Chat endpoint", async () => {
  const { getDirectCapabilities, usesDeepSeekChat } = await import(
    "./model-connection"
  );
  const { getLanguageModel } = await import("./providers");
  const env = {
    MODEL_PROVIDER: "openai",
    OPENAI_BASE_URL: "https://api.deepseek.com/v1",
    OPENAI_MODEL: "deepseek-flash",
    OPENAI_MODEL_VISION: "1",
  };
  assert.equal(usesDeepSeekChat(env), true);
  assert.deepEqual(getDirectCapabilities(env), {
    "deepseek-flash": { reasoning: true, tools: true, vision: true },
  });
  assert.equal(
    runWithModelEnvironment(
      env,
      () => getLanguageModel("deepseek-flash").provider
    ),
    "deepseek.chat"
  );
  for (const overrides of [
    { OPENAI_BASE_URL: "https://api.deepseek.com.example/v1" },
    { OPENAI_BASE_URL: "http://api.deepseek.com/v1" },
    { OPENAI_BASE_URL: "https://api.deepseek.com:8443/v1" },
    { OPENAI_API_MODE: "responses" },
    { MODEL_PROVIDER: "gateway" },
  ]) {
    assert.equal(usesDeepSeekChat({ ...env, ...overrides }), false);
  }
  assert.equal(
    runWithModelEnvironment(
      { ...env, OPENAI_API_MODE: "responses" },
      () => getLanguageModel("deepseek-flash").provider
    ),
    "openai.responses"
  );
});

test("DeepSeek reasoning survives streaming, tool continuation and stored UI-message replay with image bytes intact", async (t) => {
  const requests: Record<string, unknown>[] = [];
  const env = {
    MODEL_PROVIDER: "openai",
    OPENAI_API_KEY: "offline-only-key",
    OPENAI_BASE_URL: "https://api.deepseek.com/v1",
    OPENAI_MODEL: "deepseek-flash",
    OPENAI_MODEL_VISION: "1",
  };
  const reasons = [
    "Check the supplied values.",
    "The calculated result is five.",
  ];
  const image =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3uoAAAAASUVORK5CYII=";
  t.mock.method(globalThis, "fetch", (url: string, init: RequestInit) => {
    assert.equal(String(url), "https://api.deepseek.com/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    requests.push(body);
    const first = requests.length === 1;
    const message = first
      ? {
          content: null,
          role: "assistant",
          tool_calls: [
            {
              function: { arguments: '{"a":2,"b":3}', name: "calculate" },
              id: "sum",
              type: "function",
            },
          ],
        }
      : { content: "5", role: "assistant" };
    const common = {
      created: 1,
      id: `fixture-${requests.length}`,
      model: "deepseek-flash",
    };
    if (!body.stream) {
      return Response.json({
        ...common,
        choices: [{ finish_reason: "stop", index: 0, message }],
        object: "chat.completion",
      });
    }
    const chunks = [
      {
        delta: {
          reasoning_content: reasons[requests.length - 1],
          role: "assistant",
        },
        finish_reason: null,
        index: 0,
      },
      {
        delta: first
          ? { tool_calls: [{ ...message.tool_calls?.[0], index: 0 }] }
          : { content: "5" },
        finish_reason: null,
        index: 0,
      },
      { delta: {}, finish_reason: first ? "tool_calls" : "stop", index: 0 },
    ];
    return new Response(
      `${chunks.map((choice) => `data: ${JSON.stringify({ ...common, choices: [choice], object: "chat.completion.chunk" })}\n\n`).join("")}data: [DONE]\n\n`,
      { headers: { "content-type": "text/event-stream" } }
    );
  });
  const { getLanguageModel } = await import("./providers");
  await runWithModelEnvironment(env, async () => {
    const tools = {
      calculate: tool({
        execute: ({ a, b }) => a + b,
        inputSchema: z.object({ a: z.number(), b: z.number() }),
      }),
    };
    const result = streamText({
      maxRetries: 0,
      messages: [
        {
          content: [
            { text: "Add 2 and 3.", type: "text" },
            { data: image, mediaType: "image/png", type: "file" },
          ],
          role: "user",
        },
      ],
      model: getLanguageModel("deepseek-flash"),
      prepareStep: ({ stepNumber }) =>
        completionStepSettings(stepNumber, 2, "Complete the calculation."),
      stopWhen: isStepCount(3),
      tools,
    });
    let saved: UIMessage | undefined;
    for await (const message of readUIMessageStream({
      stream: toUIMessageStream({ sendReasoning: true, stream: result.stream }),
      terminateOnError: true,
    })) {
      saved = message;
    }
    assert.equal(await result.text, "5");
    assert.equal(requests.length, 2);
    assert.ok(Array.isArray(requests[0].tools));
    assert.ok(Array.isArray(requests[1].tools));
    assert.equal(requests[1].tool_choice, "auto");
    assert.deepEqual(
      saved?.parts
        .filter((part) => part.type === "reasoning")
        .map((part) => part.text),
      reasons
    );
    const secondMessages = requests[1].messages as {
      role: string;
      reasoning_content?: string;
      content?: unknown;
    }[];
    assert.equal(
      secondMessages.find((message) => message.role === "assistant")
        ?.reasoning_content,
      reasons[0]
    );
    const firstMessages = requests[0].messages as {
      role: string;
      content: { type: string; image_url?: { url: string } }[];
    }[];
    assert.equal(
      firstMessages
        .find((message) => message.role === "user")
        ?.content.find((part) => part.type === "image_url")?.image_url?.url,
      image
    );
    assert.ok(saved);
    await generateText({
      maxRetries: 0,
      messages: await convertToModelMessages(
        [
          JSON.parse(JSON.stringify(saved)),
          {
            id: "next",
            parts: [{ text: "Confirm the result.", type: "text" }],
            role: "user",
          },
        ],
        { tools }
      ),
      model: getLanguageModel("deepseek-flash"),
      tools,
    });
    const restored = (
      requests[2].messages as { role: string; reasoning_content?: string }[]
    ).filter((message) => message.role === "assistant");
    assert.deepEqual(
      restored.map((message) => message.reasoning_content),
      reasons
    );
  });
});

test("chat, streaming and title requests use the configured endpoint, key and exact model ID", async () => {
  const requests: {
    path?: string;
    auth?: string;
    body: Record<string, unknown>;
  }[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
    }
    const input = JSON.parse(body);
    requests.push({
      auth: request.headers.authorization,
      body: input,
      path: request.url,
    });
    const common = {
      created: 1,
      id: "chatcmpl-test",
      model: "vendor/custom-model",
      object: "chat.completion",
    };
    if (request.url?.endsWith("/responses")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          created_at: 1,
          id: "resp-test",
          model: "vendor/custom-model",
          object: "response",
          output: [
            {
              content: [
                {
                  annotations: [],
                  text: "Responses 测试",
                  type: "output_text",
                },
              ],
              id: "msg-test",
              role: "assistant",
              status: "completed",
              type: "message",
            },
          ],
          status: "completed",
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        })
      );
      return;
    }
    if (input.stream) {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const chunk of [
        {
          ...common,
          choices: [
            {
              delta: { content: "流式测试", role: "assistant" },
              finish_reason: null,
              index: 0,
            },
          ],
          object: "chat.completion.chunk",
        },
        {
          ...common,
          choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
          object: "chat.completion.chunk",
        },
      ]) {
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      response.end("data: [DONE]\n\n");
    } else {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          ...common,
          choices: [
            {
              finish_reason: "stop",
              index: 0,
              message: { content: "连接测试", role: "assistant" },
            },
          ],
          usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
        })
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const overrides = {
    MODEL_PROVIDER: "openai",
    OPENAI_API_KEY: "test-only-key",
    OPENAI_API_MODE: "chat",
    OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/custom/v1`,
    OPENAI_MODEL: "vendor/custom-model",
  };
  const previous = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, process.env[key]])
  );
  Object.assign(process.env, overrides);
  try {
    const { getLanguageModel, getTitleModel } = await import(
      "@/server/application/ai/providers"
    );
    const result = await generateText({
      maxRetries: 0,
      model: getLanguageModel("vendor/custom-model"),
      prompt: "test",
    });
    assert.equal(result.text, "连接测试");
    assert.equal(
      await streamText({
        maxRetries: 0,
        model: getLanguageModel("vendor/custom-model"),
        prompt: "stream",
      }).text,
      "流式测试"
    );
    assert.equal(
      (
        await generateText({
          maxRetries: 0,
          model: getTitleModel(),
          prompt: "title",
        })
      ).text,
      "连接测试"
    );
    assert.equal(requests.length, 3);
    for (const request of requests) {
      assert.equal(request.path, "/custom/v1/chat/completions");
      assert.equal(request.auth, "Bearer test-only-key");
      assert.equal(request.body.model, "vendor/custom-model");
    }
    process.env.OPENAI_API_MODE = "responses";
    assert.equal(
      (
        await generateText({
          maxRetries: 0,
          model: getLanguageModel("vendor/custom-model"),
          prompt: "responses",
        })
      ).text,
      "Responses 测试"
    );
    assert.equal(requests[3].path, "/custom/v1/responses");
    assert.equal(requests[3].auth, "Bearer test-only-key");
    assert.equal(requests[3].body.model, "vendor/custom-model");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

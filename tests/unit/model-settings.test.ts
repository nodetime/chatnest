// biome-ignore-all lint/performance/noAwaitInLoops: Sequential isolated validation cases.
// biome-ignore-all lint/suspicious/useAwait: In-memory async repository fixture.
import assert from "node:assert/strict";
import test from "node:test";
import type { SettingsRow } from "../../lib/agent/mcp-settings/repository";
import { createModelSettingsService } from "../../lib/ai/model-settings/service";

const env = {
  MCP_SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  OPENAI_API_KEY: "legacy-secret",
  OPENAI_BASE_URL: "https://legacy.example/v1",
  OPENAI_MODEL: "legacy",
  POSTGRES_URL: "test",
};
const config = {
  apiMode: "chat" as const,
  baseURL: "https://api.openai.com/v1",
  defaultModel: "model-a",
  models: [
    { id: "model-a", tools: true, vision: false },
    { id: "model-b", tools: false, vision: true },
  ],
};
function fixture() {
  let row: SettingsRow | null = null;
  const repository = {
    compareAndSwap: async (expected: number, next: SettingsRow) => {
      if ((row?.revision ?? 0) !== expected) {
        return false;
      }
      row = next;
      return true;
    },
    read: async () => row,
  };
  return {
    repository,
    row: () => row,
    service: createModelSettingsService({ env, repository }),
  };
}
test("admin settings encrypt keys, project only metadata and enforce CAS", async () => {
  const { service, row } = fixture();
  assert.equal((await service.get()).source, "environment");
  const edit = {
    config,
    key: { mode: "replace" as const, value: "independent-openai-key" },
    revision: 0,
  };
  await service.save(edit, "admin");
  assert.ok(row()?.encrypted);
  assert.ok(!row()?.encrypted.includes("independent-openai-key"));
  const projection = await service.get();
  assert.equal(projection.source, "managed");
  assert.equal(projection.hasKey, true);
  assert.equal(
    JSON.stringify(projection).includes("independent-openai-key"),
    false
  );
  assert.equal((await service.load())?.apiKey, "independent-openai-key");
  await assert.rejects(service.save(edit, "admin"), /配置已更新/);
});
test("keeping a key binds to exact endpoint and never crosses providers", async () => {
  const { service } = fixture();
  await assert.rejects(
    service.save({ config, key: { mode: "keep" }, revision: 0 }, "admin"),
    /地址/
  );
  await service.save(
    { config, key: { mode: "replace", value: "new-key" }, revision: 0 },
    "admin"
  );
  await service.save(
    {
      config: { ...config, defaultModel: "model-b" },
      key: { mode: "keep" },
      revision: 1,
    },
    "admin"
  );
  assert.equal((await service.load())?.defaultModel, "model-b");
  await assert.rejects(
    service.save(
      {
        config: { ...config, baseURL: "https://different.example/v1" },
        key: { mode: "keep" },
        revision: 2,
      },
      "admin"
    ),
    /地址/
  );
});
test("validation rejects invalid catalogs, credentials in URLs and endpoint suffixes", async () => {
  for (const bad of [
    { ...config, defaultModel: "missing" },
    { ...config, models: [config.models[0], config.models[0]] },
    { ...config, baseURL: "https://user:secret@example.com/v1" },
    { ...config, baseURL: "https://example.com/v1/chat/completions" },
    { ...config, baseURL: "http://example.com/v1" },
  ]) {
    await assert.rejects(
      fixture().service.save(
        { config: bad, key: { mode: "replace", value: "test" }, revision: 0 },
        "admin"
      )
    );
  }
});
test("test resolves private draft without saving or leaking the response", async () => {
  const { repository } = fixture();
  let seen = "";
  const service = createModelSettingsService({
    env,
    probe: async (settings) => {
      seen = settings.apiKey;
      return { message: "模型响应正常。", ok: true };
    },
    repository,
  });
  const result = await service.test({
    config,
    key: { mode: "replace", value: "draft-only" },
    revision: 0,
  });
  assert.equal(seen, "draft-only");
  assert.equal(result.ok, true);
  assert.equal(await repository.read(), null);
});

test("encrypted settings fail closed on wrong key or domain", async () => {
  const { repository, service, row } = fixture();
  await service.save(
    { config, key: { mode: "replace", value: "private-key" }, revision: 0 },
    "admin"
  );
  await assert.rejects(
    createModelSettingsService({
      env: {
        ...env,
        MCP_SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64"),
      },
      repository,
    }).load()
  );
  const { decryptSettings, parseEncryptionKey } = await import(
    "../../lib/agent/mcp-settings/crypto"
  );
  assert.throws(() =>
    decryptSettings(
      row()?.encrypted ?? "",
      1,
      parseEncryptionKey(env.MCP_SETTINGS_ENCRYPTION_KEY)
    )
  );
});
test("concurrent request snapshots isolate keys and keep child model calls on the same connection", async () => {
  const { runWithModelEnvironment } = await import(
    "../../lib/ai/model-context"
  );
  const {
    getRuntimeModels,
    resolveModelId,
    getModelConnection,
    getDirectCapabilities,
  } = await import("../../lib/ai/model-connection");
  const { getLanguageModel, getTitleModel } = await import(
    "../../lib/ai/providers"
  );
  await Promise.all(
    ["one", "two"].map((name) =>
      runWithModelEnvironment(
        {
          OPENAI_API_KEY: `secret-${name}`,
          OPENAI_BASE_URL: `https://${name}.example/v1`,
          OPENAI_MANAGED_MODELS: JSON.stringify([
            { id: `${name}-default`, tools: true, vision: false },
            { id: `${name}-other`, tools: false, vision: true },
          ]),
          OPENAI_MODEL: `${name}-default`,
        },
        async () => {
          await new Promise((r) => setTimeout(r, name === "one" ? 10 : 1));
          assert.equal(
            getModelConnection().baseURL,
            `https://${name}.example/v1`
          );
          assert.equal(resolveModelId("stale-cookie"), `${name}-default`);
          assert.equal(getRuntimeModels().length, 2);
          assert.equal(getDirectCapabilities()[`${name}-other`].vision, true);
          assert.equal(
            getLanguageModel(`${name}-other`).modelId,
            `${name}-other`
          );
          assert.equal(getTitleModel().modelId, `${name}-default`);
        }
      )
    )
  );
});
test("management authenticates before reading and rejects cross-origin writes and oversized bodies", async () => {
  const { createModelSettingsHandler } = await import(
    "../../lib/ai/model-settings/handler"
  );
  const prior = process.env.PLATFORM_ADMIN_USER_IDS;
  process.env.PLATFORM_ADMIN_USER_IDS = "33333333-3333-4333-8333-333333333333";
  try {
    let reads = 0;
    const { service } = fixture();
    const originalGet = service.get;
    service.get = async () => {
      reads += 1;
      return originalGet();
    };
    const route = (user: { id: string; type: string } | null) =>
      createModelSettingsHandler({ service, session: async () => user });
    assert.equal(
      (await route(null)(new Request("https://app.example/api/admin/models")))
        .status,
      401
    );
    assert.equal(
      (
        await route({ id: "other", type: "regular" })(
          new Request("https://app.example/api/admin/models")
        )
      ).status,
      403
    );
    assert.equal(reads, 0);
    const admin = route({
      id: "33333333-3333-4333-8333-333333333333",
      type: "regular",
    });
    assert.equal(
      (
        await admin(
          new Request("https://app.example/api/admin/models", {
            body: "{}",
            headers: { origin: "https://evil.example" },
            method: "POST",
          })
        )
      ).status,
      403
    );
    assert.equal(
      (
        await admin(
          new Request("https://app.example/api/admin/models", {
            body: " ".repeat(32_769),
            headers: { origin: "https://app.example" },
            method: "POST",
          })
        )
      ).status,
      413
    );
    const response = await admin(
      new Request("https://app.example/api/admin/models")
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal((await response.text()).includes("legacy-secret"), false);
  } finally {
    if (prior === undefined) {
      delete process.env.PLATFORM_ADMIN_USER_IDS;
    } else {
      process.env.PLATFORM_ADMIN_USER_IDS = prior;
    }
  }
});
test("model transport rejects private destinations and redirect forwarding; real SDK probe is bounded and sanitized", async () => {
  const { isPublicAddress, validateModelURL, modelFetch } = await import(
    "../../lib/ai/model-settings/network"
  );
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "169.254.169.254",
    "100.100.100.200",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::",
  ]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.throws(() => validateModelURL("https://127.0.0.1/v1", {}));
  const { createServer } = await import("node:http");
  let calls = 0;
  let status = 200;
  const server = createServer(async (req, res) => {
    calls += 1;
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }
    if (status === 302) {
      res.writeHead(302, { location: "https://other.example/secret" });
      res.end();
      return;
    }
    if (status !== 200) {
      res.writeHead(status);
      res.end("secret-upstream-body");
      return;
    }
    assert.equal(req.headers.authorization, "Bearer probe-only");
    assert.equal(JSON.parse(body).model, "model-a");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: "OK", role: "assistant" },
          },
        ],
        created: 1,
        id: "chatcmpl-fixture",
        model: "model-a",
        object: "chat.completion",
      })
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseURL = `http://127.0.0.1:${address.port}/v1`;
  const testEnv = { MODEL_ALLOW_LOOPBACK_HTTP: "1", NODE_ENV: "test" };
  try {
    const { probeModel } = await import("../../lib/ai/model-settings/probe");
    const settings = { ...config, apiKey: "probe-only", baseURL };
    assert.equal((await probeModel(settings, testEnv)).ok, true);
    status = 401;
    const failed = await probeModel(settings, testEnv);
    assert.equal(failed.status, 401);
    assert.equal(JSON.stringify(failed).includes("secret"), false);
    status = 502;
    assert.equal((await probeModel(settings, testEnv)).status, 502);
    status = 204;
    assert.equal(
      (await modelFetch(baseURL, testEnv)(`${baseURL}/models`)).status,
      204
    );
    status = 205;
    assert.equal(
      (await modelFetch(baseURL, testEnv)(`${baseURL}/models`)).status,
      205
    );
    status = 302;
    await assert.rejects(
      modelFetch(baseURL, testEnv)(`${baseURL}/models`),
      /重定向/
    );
    const before = calls;
    await assert.rejects(
      modelFetch(baseURL, testEnv)(`${baseURL}/other`),
      /目标/
    );
    assert.equal(calls, before);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("actual SDK SSE pump preserves each model snapshot through a tool child and a second step", async () => {
  const { createServer } = await import("node:http");
  const {
    createUIMessageStream,
    createUIMessageStreamResponse,
    streamText,
    toUIMessageStream,
    generateText,
    jsonSchema,
    isStepCount,
  } = await import("ai");
  const { runWithModelEnvironment, getModelEnvironment } = await import(
    "../../lib/ai/model-context"
  );
  const { getLanguageModel, getTitleModel } = await import(
    "../../lib/ai/providers"
  );
  const calls: string[] = [];
  const children: string[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }
    const input = JSON.parse(body);
    const [name] = input.model.split("-");
    assert.equal(req.headers.authorization, `Bearer secret-${name}`);
    calls.push(input.model);
    const common = { created: 1, id: `chatcmpl-${name}`, model: input.model };
    if (!input.stream) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ...common,
          choices: [
            {
              finish_reason: "stop",
              index: 0,
              message: { content: "child-ok", role: "assistant" },
            },
          ],
          object: "chat.completion",
        })
      );
      return;
    }
    const second = input.messages.some(
      (m: { role: string }) => m.role === "tool"
    );
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const choice of [
      {
        delta: second
          ? { content: "done", role: "assistant" }
          : {
              role: "assistant",
              tool_calls: [
                {
                  function: { arguments: "{}", name: "child" },
                  id: `call-${name}`,
                  index: 0,
                  type: "function",
                },
              ],
            },
        finish_reason: null,
        index: 0,
      },
      { delta: {}, finish_reason: second ? "stop" : "tool_calls", index: 0 },
    ]) {
      res.write(
        `data: ${JSON.stringify({ ...common, choices: [choice], object: "chat.completion.chunk" })}\n\n`
      );
    }
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const responses = await Promise.all(
      ["one", "two"].map((name) =>
        runWithModelEnvironment(
          {
            MODEL_ALLOW_LOOPBACK_HTTP: "1",
            NODE_ENV: "test",
            OPENAI_API_KEY: `secret-${name}`,
            OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
            OPENAI_MANAGED_CONNECTION: "1",
            OPENAI_MODEL: `${name}-main`,
          },
          () =>
            createUIMessageStreamResponse({
              stream: createUIMessageStream({
                execute: async ({ writer }) => {
                  const result = streamText({
                    maxRetries: 0,
                    model: getLanguageModel("stale"),
                    prompt: "invoke child",
                    stopWhen: isStepCount(3),
                    tools: {
                      child: {
                        execute: async () => {
                          children.push(
                            getModelEnvironment().OPENAI_MODEL ?? "missing"
                          );
                          return (
                            await generateText({
                              maxRetries: 0,
                              model: getTitleModel(),
                              prompt: "child",
                            })
                          ).text;
                        },
                        inputSchema: jsonSchema<Record<string, never>>({
                          additionalProperties: false,
                          properties: {},
                          type: "object",
                        }),
                      },
                    },
                  });
                  writer.merge(toUIMessageStream({ stream: result.stream }));
                  await result.text;
                },
              }),
            })
        )
      )
    );
    const texts = await Promise.all(responses.map((r) => r.text()));
    assert.equal(calls.length, 6);
    assert.deepEqual(
      children.sort((a, b) => a.localeCompare(b)),
      ["one-main", "two-main"]
    );
    for (const text of texts) {
      assert.match(text, /done/);
      assert.doesNotMatch(text, /"type":"error"/);
    }
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

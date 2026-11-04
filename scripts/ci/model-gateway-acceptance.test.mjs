// biome-ignore-all lint/performance/noAwaitInLoops: Sequential, isolated real HTTP fixtures deliberately avoid shared-port races.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

const file = new URL("../model-gateway-acceptance.mjs", import.meta.url);
const secret = "diagnostic-key-canary-not-for-logs";
async function fixture(
  t,
  {
    catalogStatus = 200,
    body = { data: [{ id: "fixture-model" }] },
    redirect = false,
    textStatus = 200,
    textBody,
  } = {}
) {
  const calls = [];
  const server = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) {
      text += chunk;
    }
    calls.push({
      authorization: req.headers.authorization,
      body: text,
      method: req.method,
      path: req.url,
    });
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/models") {
      res.statusCode = redirect ? 302 : catalogStatus;
      if (redirect) {
        res.setHeader("location", "/v1/chat/completions");
      }
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    } else {
      res.statusCode = textStatus;
      res.end(
        JSON.stringify(
          textBody ?? {
            choices: [
              {
                finish_reason: "stop",
                index: 0,
                message: {
                  content: "private-response-canary",
                  role: "assistant",
                },
              },
            ],
            created: 1,
            id: "fixture-response",
            model: "fixture-model",
            object: "chat.completion",
            usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
          }
        )
      );
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return { base: `http://127.0.0.1:${server.address().port}/v1`, calls };
}
async function run(base, args = [], overrides = {}, context = null) {
  const env = {
    HOME: process.env.HOME,
    MODEL_ALLOW_LOOPBACK_HTTP: "1",
    MODEL_PROVIDER: "openai",
    NODE_ENV: "test",
    OPENAI_API_KEY: secret,
    OPENAI_API_MODE: "chat",
    OPENAI_BASE_URL: base,
    OPENAI_MODEL: "fixture-model",
    PATH: process.env.PATH,
    ...overrides,
  };
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) {
      delete env[key];
    }
  }
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--conditions=react-server",
      ...(context
        ? [
            "--input-type=module",
            "--eval",
            `
        import { createRequire } from "node:module";
        const require = createRequire(${JSON.stringify(file.href)});
        const { runWithModelEnvironment } = require("../server/application/ai/model-context.ts");
        await runWithModelEnvironment({ ...process.env, ...${JSON.stringify(context)} }, () => import(${JSON.stringify(file.href)}));
      `,
          ]
        : [file.pathname, ...args]),
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] }
  );
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const [code] = await once(child, "close");
  return {
    code,
    stderr,
    stdout,
    value: JSON.parse(stdout.trim() || stderr.trim()),
  };
}
test("default diagnostic is GET-only and never claims text or E2E acceptance", async (t) => {
  const f = await fixture(t),
    r = await run(f.base);
  assert.equal(r.code, 0);
  assert.deepEqual(
    f.calls.map(({ method, path }) => [method, path]),
    [["GET", "/v1/models"]]
  );
  assert.equal(r.value.check, "catalog");
  assert.equal(r.value.catalog.targetListed, true);
  assert.equal(r.value.catalog.status, 200);
  assert.equal(r.value.inference.attempted, false);
  assert.equal(r.value.endToEndVerified, false);
  assert.equal((r.stdout + r.stderr).includes(secret), false);
  assert.equal((r.stdout + r.stderr).includes(f.base), false);
});
for (const [name, options] of [
  ["HTTP failure", { catalogStatus: 502 }],
  ["missing target", { body: { data: [{ id: "different-model" }] } }],
  ["malformed body", { body: { models: [] } }],
  ["invalid JSON", { body: "not-json" }],
]) {
  test(`${name} never reaches inference, including explicit text mode`, async (t) => {
    const f = await fixture(t, options),
      r = await run(f.base, ["--probe-inference"]);
    assert.equal(r.code, 1);
    assert.deepEqual(
      f.calls.map((x) => x.method),
      ["GET"]
    );
    assert.equal(r.value.inference.attempted, false);
    assert.equal(r.value.catalog.status, options.catalogStatus ?? 200);
  });
}
test("explicit smoke uses current SDK response validation, never logs returned text", async (t) => {
  const f = await fixture(t),
    r = await run(f.base, ["--probe-inference"]);
  assert.equal(r.code, 0);
  assert.deepEqual(
    f.calls.map(({ method, path }) => [method, path]),
    [
      ["GET", "/v1/models"],
      ["POST", "/v1/chat/completions"],
    ]
  );
  assert.equal(r.value.inference.attempted, true);
  assert.equal(r.value.inference.ok, true);
  assert.equal(r.value.endToEndVerified, false);
  assert.equal(
    (r.stdout + r.stderr).includes("private-response-canary"),
    false
  );
});
test("redirect remains blocked and is never followed to another request", async (t) => {
  const f = await fixture(t, { redirect: true }),
    r = await run(f.base);
  assert.equal(r.code, 1);
  assert.equal(f.calls.length, 1);
  assert.equal(r.value.inference.attempted, false);
});
for (const args of [
  ["--unknown"],
  ["--probe-inference", "--probe-inference"],
]) {
  test(`bad arguments ${args.join(" ")} reject before any network or DB load`, async (t) => {
    const f = await fixture(t),
      r = await run(f.base, args, {
        POSTGRES_URL: "postgres://closed:closed@127.0.0.1:1/not-opened",
      });
    assert.equal(r.code, 2);
    assert.equal(f.calls.length, 0);
    assert.equal(r.value.code, "MODEL_DIAGNOSTIC_ARGUMENTS_INVALID");
  });
}
for (const key of [
  "MODEL_GATEWAY_BASE_URL",
  "MODEL_GATEWAY_API_KEY",
  "MODEL_GATEWAY_MODEL",
]) {
  test(`removed ${key} override fails closed, no parallel connection source`, async (t) => {
    const f = await fixture(t),
      r = await run(f.base, [], { [key]: "private-override-canary" });
    assert.equal(r.code, 2);
    assert.equal(f.calls.length, 0);
    assert.equal(
      (r.stdout + r.stderr).includes("private-override-canary"),
      false
    );
  });
}
test("production local destinations and credential-bearing URLs are rejected by the app transport", async (t) => {
  const f = await fixture(t);
  for (const env of [
    { NODE_ENV: "production" },
    { OPENAI_API_MODE: "legacy" },
    { OPENAI_BASE_URL: f.base.replace("http://", "http://private-secret@") },
  ]) {
    const r = await run(f.base, [], env);
    assert.equal(r.code, 2);
    assert.equal(f.calls.length, 0);
    assert.equal((r.stdout + r.stderr).includes("private-secret"), false);
  }
});

test("responses smoke uses the existing SDK raw output interpretation", async (t) => {
  const f = await fixture(t, {
    textBody: {
      created_at: 1,
      id: "fixture-response",
      model: "fixture-model",
      output: [
        {
          content: [
            {
              annotations: [],
              text: "private-response-canary",
              type: "output_text",
            },
          ],
          id: "message-fixture",
          role: "assistant",
          type: "message",
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  });
  const r = await run(f.base, ["--probe-inference"], {
    OPENAI_API_MODE: "responses",
  });
  assert.equal(r.code, 0);
  assert.deepEqual(
    f.calls.map(({ method, path }) => [method, path]),
    [
      ["GET", "/v1/models"],
      ["POST", "/v1/responses"],
    ]
  );
  assert.equal(r.value.inference.ok, true);
  assert.equal(r.value.endToEndVerified, false);
  assert.equal(
    (r.stdout + r.stderr).includes("private-response-canary"),
    false
  );
});
test("explicit upstream error is one SDK attempt, no automatic retry or response leak", async (t) => {
  const f = await fixture(t, {
    textBody: {
      error: {
        code: "fixture",
        message: "private-response-canary",
        type: "upstream_error",
      },
    },
    textStatus: 502,
  });
  const r = await run(f.base, ["--probe-inference"]);
  assert.equal(r.code, 1);
  assert.deepEqual(
    f.calls.map((x) => x.method),
    ["GET", "POST"]
  );
  assert.equal(r.value.inference.attempted, true);
  assert.equal(r.value.inference.ok, false);
  assert.equal(r.value.inference.status, 502);
  assert.equal(
    (r.stdout + r.stderr).includes("private-response-canary"),
    false
  );
});
test("a gateway SDK configuration never falls through to an unrelated OpenAI URL", async (t) => {
  const f = await fixture(t),
    r = await run(f.base, [], {
      AI_GATEWAY_API_KEY: secret,
      MODEL_PROVIDER: "gateway",
    });
  assert.equal(r.code, 2);
  assert.equal(f.calls.length, 0);
});
test("catalog counts deduplicate valid IDs without printing their bodies", async (t) => {
  const f = await fixture(t, {
      body: {
        data: [
          null,
          { id: 1 },
          { id: "fixture-model" },
          { id: "fixture-model" },
          { id: "not a model" },
        ],
      },
    }),
    r = await run(f.base);
  assert.equal(r.code, 0);
  assert.equal(r.value.catalog.modelCount, 1);
  assert.equal(r.value.catalog.targetListed, true);
  assert.equal(r.stdout.includes("fixture-model"), false);
});

test("empty text does not pass an explicit smoke", async (t) => {
  const f = await fixture(t, {
      textBody: {
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: " ", role: "assistant" },
          },
        ],
        created: 1,
        id: "response",
        model: "fixture-model",
        object: "chat.completion",
      },
    }),
    r = await run(f.base, ["--probe-inference"]);
  assert.equal(r.code, 1);
  assert.equal(r.value.inference.attempted, true);
  assert.equal(r.value.inference.ok, false);
  assert.equal(f.calls.length, 2);
});
test("obsolete completion-shaped text is not interpreted by a parallel parser", async (t) => {
  const f = await fixture(t, {
      textBody: { choices: [{ text: "private-response-canary" }] },
    }),
    r = await run(f.base, ["--probe-inference"]);
  assert.equal(r.code, 1);
  assert.equal(r.value.inference.ok, false);
  assert.equal(
    (r.stdout + r.stderr).includes("private-response-canary"),
    false
  );
});
test("catalog preserves its actual successful status rather than inventing 200", async (t) => {
  const f = await fixture(t, { catalogStatus: 201 }),
    r = await run(f.base);
  assert.equal(r.code, 0);
  assert.equal(r.value.catalog.status, 201);
  assert.equal(r.value.inference.attempted, false);
  assert.equal(f.calls[0].authorization, `Bearer ${secret}`);
});

test("CLI shares application request context instead of falling back to deployment environment", async (t) => {
  const deployment = await fixture(t),
    managed = await fixture(t);
  const r = await run(
    deployment.base,
    [],
    {},
    {
      OPENAI_BASE_URL: managed.base,
      OPENAI_MANAGED_CONNECTION: "1",
      OPENAI_MANAGED_MODELS: JSON.stringify([
        { id: "fixture-model", tools: true, vision: false },
      ]),
    }
  );
  assert.equal(r.code, 0);
  assert.equal(deployment.calls.length, 0);
  assert.equal(managed.calls.length, 1);
  assert.equal(managed.calls[0].method, "GET");
  assert.equal(managed.calls[0].authorization, `Bearer ${secret}`);
  assert.equal(r.value.inference.attempted, false);
});

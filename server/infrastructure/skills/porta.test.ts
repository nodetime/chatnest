// biome-ignore-all lint/suspicious/noTemplateCurlyInString: literal deployment references are the test inputs
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { createMCPClient, MCPClient } from "@ai-sdk/mcp";
import { jsonSchema } from "ai";
import {
  agentConfigSchema,
  resolveServerConnection,
} from "@/server/infrastructure/mcp/config";
import { createAgentRuntime } from "@/server/infrastructure/mcp/runtime";
import {
  discoverSkills,
  readSkillFile,
} from "@/server/infrastructure/mcp/skills";

const toolNames = [
  "item_search",
  "item_get",
  "item_get_shop",
  "item_get_company",
  "upload_img",
  "item_search_img",
].map((name) => `onebound_1688_${name}`);
const defaultConfig = JSON.parse(
  readFileSync("server/infrastructure/mcp/agent.json", "utf8")
);
const porta = () => {
  const server = agentConfigSchema
    .parse(defaultConfig)
    .servers.find((item) => item.id === "porta");
  assert.ok(server, "default config must register optional Porta");
  return server;
};

test("default Porta registers exactly six native tools without auto approval; Exa remains unchanged", () => {
  const server = porta();
  assert.deepEqual(server.allowedTools, toolNames);
  assert.deepEqual(server.autoApproveTools, []);
  assert.equal(server.url, "${PORTA_MCP_URL}");
  assert.deepEqual(
    defaultConfig.servers.find((item: { id: string }) => item.id === "exa"),
    {
      allowedTools: ["web_search_exa", "web_fetch_exa"],
      autoApproveTools: ["web_search_exa", "web_fetch_exa"],
      headers: {},
      id: "exa",
      name: "Exa 网页搜索",
      url: "https://mcp.exa.ai/mcp",
    }
  );
});

test("URL environment references must be a complete endpoint, never partial interpolation", () => {
  for (const url of ["${PORTA_MCP_URL}", "https://bridge.example/mcp"]) {
    assert.ok(
      agentConfigSchema.safeParse({
        servers: [{ id: "s", name: "s", url }],
      }).success
    );
  }
  for (const url of [
    "https://${HOST}/mcp",
    "${lowercase}",
    "${HOST}/mcp",
    "https://user:secret@bridge.example/mcp",
    "https://bridge.example/mcp#secret",
    "http://127.0.0.1:8080/mcp",
  ]) {
    assert.equal(
      agentConfigSchema.safeParse({
        servers: [{ id: "s", name: "s", url }],
      }).success,
      false,
      url
    );
  }
});

test("server-side URL and bearer substitution reports missing environment without exposing credentials", () => {
  const resolve = resolveServerConnection;
  assert.equal(typeof resolve, "function");
  assert.deepEqual(resolve(porta(), {}).missing, [
    "PORTA_SERVICE_TOKEN",
    "PORTA_MCP_URL",
  ]);
  const resolved = resolve(porta(), {
    PORTA_MCP_URL: "https://bridge.example/mcp",
    PORTA_SERVICE_TOKEN: "fixture-service-token",
  });
  assert.equal(resolved.url, "https://bridge.example/mcp");
  assert.equal(resolved.headers.Authorization, "Bearer fixture-service-token");
  assert.deepEqual(resolved.missing, []);
  assert.equal(resolved.invalid, false);
});

test("loopback HTTP needs explicit development opt-in, never opens arbitrary HTTP or production", () => {
  const server = porta();
  const base = { PORTA_SERVICE_TOKEN: "fixture-service-token" };
  const dev = {
    ...base,
    AGENT_MCP_ALLOW_LOOPBACK_HTTP: "1",
    NODE_ENV: "development",
  };
  for (const url of [
    "http://localhost:8080/mcp",
    "http://127.0.0.1:8080/mcp",
    "http://[::1]:8080/mcp",
  ]) {
    assert.equal(
      resolveServerConnection(server, {
        ...base,
        PORTA_MCP_URL: url,
      }).invalid,
      true
    );
    assert.equal(
      resolveServerConnection(server, {
        ...dev,
        PORTA_MCP_URL: url,
      }).invalid,
      false
    );
    assert.equal(
      resolveServerConnection(server, {
        ...dev,
        NODE_ENV: "production",
        PORTA_MCP_URL: url,
      }).invalid,
      true
    );
    assert.equal(
      resolveServerConnection(server, {
        ...dev,
        NODE_ENV: undefined,
        PORTA_MCP_URL: url,
      }).invalid,
      true
    );
  }
  for (const url of [
    "http://192.168.1.2/mcp",
    "http://bridge.example/mcp",
    "http://localhost.evil/mcp",
    "http://127.0.0.1.evil/mcp",
    "http://user:secret@localhost/mcp",
    "file:///tmp/mcp",
    "https://bridge.example/mcp#fragment",
    "https://user:secret@bridge.example/mcp",
    "${OTHER_ENDPOINT}",
    " https://bridge.example/mcp",
    "https://bridge.example/\npath",
  ]) {
    assert.equal(
      resolveServerConnection(server, {
        ...dev,
        PORTA_MCP_URL: url,
      }).invalid,
      true,
      url
    );
  }
});

test("missing, malformed and unapproved local Porta settings skip only Porta", async () => {
  const keys = [
    "AGENT_CONFIG_PATH",
    "PORTA_MCP_URL",
    "PORTA_SERVICE_TOKEN",
    "AGENT_MCP_ALLOW_LOOPBACK_HTTP",
    "TAVILY_API_KEY",
  ];
  const previous = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) {
      delete process.env[key];
    }
    for (const settings of [
      {},
      { PORTA_MCP_URL: "https://bridge.example/mcp" },
      { PORTA_SERVICE_TOKEN: "fixture-service-token" },
      {
        PORTA_MCP_URL: "http://bridge.example/mcp",
        PORTA_SERVICE_TOKEN: "fixture-service-token",
      },
      {
        PORTA_MCP_URL: "not-a-url",
        PORTA_SERVICE_TOKEN: "fixture-service-token",
      },
    ]) {
      delete process.env.PORTA_MCP_URL;
      delete process.env.PORTA_SERVICE_TOKEN;
      Object.assign(process.env, settings);
      const connections: string[] = [];
      // biome-ignore lint/performance/noAwaitInLoops: cases intentionally isolate process.env sequentially
      const runtime = await createAgentRuntime(new AbortController().signal, (({
        transport,
      }) => {
        assert.ok("type" in transport && transport.type === "http");
        connections.push(transport.url);
        return Promise.resolve({
          close: async () => undefined,
          tools: async () => ({}),
        } as unknown as MCPClient);
      }) as typeof createMCPClient);
      assert.deepEqual(connections, ["https://mcp.exa.ai/mcp"]);
      assert.match(
        runtime.instructions,
        /Porta.*(?:not configured|configuration is invalid)/
      );
      await runtime.close();
    }
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[index];
      }
    });
  }
});

test("configured Porta passes native input/output unchanged and gates every paid tool", async () => {
  const keys = [
    "AGENT_CONFIG_PATH",
    "PORTA_MCP_URL",
    "PORTA_SERVICE_TOKEN",
    "TAVILY_API_KEY",
  ];
  const previous = keys.map((key) => process.env[key]);
  const input = { page: "2", page_size: "7", q: "fixture query", sort: "bid" };
  const output = {
    content: [{ text: '{"items":{"item":[],"page_size":"7"}}', type: "text" }],
    structuredContent: { items: { item: [], page_size: "7" } },
  };
  let received: unknown;
  try {
    for (const key of keys) {
      delete process.env[key];
    }
    process.env.PORTA_MCP_URL = "https://bridge.example/mcp";
    process.env.PORTA_SERVICE_TOKEN = "fixture-service-token";
    const remote = {
      description: "Native tool",
      execute: (value: unknown) => {
        received = value;
        return output;
      },
      inputSchema: jsonSchema({ additionalProperties: true, type: "object" }),
    };
    const runtime = await createAgentRuntime(new AbortController().signal, (({
      transport,
    }) => {
      assert.ok("type" in transport && transport.type === "http");
      if (transport.url === "https://bridge.example/mcp") {
        assert.equal(
          transport.headers?.Authorization,
          "Bearer fixture-service-token"
        );
        return Promise.resolve({
          close: async () => undefined,
          tools: async () =>
            Object.fromEntries(
              [...toolNames, "unlisted_delete"].map((name) => [name, remote])
            ),
        } as unknown as MCPClient);
      }
      return Promise.resolve({
        close: async () => undefined,
        tools: async () => ({ web_search_exa: remote }),
      } as unknown as MCPClient);
    }) as typeof createMCPClient);
    assert.equal(runtime.tools.exa__web_search_exa.needsApproval, false);
    for (const name of toolNames) {
      assert.equal(runtime.tools[`porta__${name}`].needsApproval, true);
    }
    assert.equal(runtime.tools.porta__unlisted_delete, undefined);
    const { execute } = runtime.tools.porta__onebound_1688_item_search;
    assert.ok(execute);
    assert.equal(
      await execute(input, {
        context: {},
        messages: [],
        toolCallId: "native-fixture",
      }),
      output
    );
    assert.equal(received, input);
    assert.ok(!runtime.instructions.includes("fixture-service-token"));
    await runtime.close();
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[index];
      }
    });
  }
});

test("independent 1688 investigation skill loads on demand while content investigation remains intact", async () => {
  const skills = await discoverSkills();
  const procurement = skills.find((skill) => skill.name === "source-1688");
  assert.ok(procurement);
  assert.equal(procurement.displayName, "1688商品与主体线索调查");
  assert.match(procurement.description, /律师/);
  const body = await readSkillFile(procurement, "SKILL.md");
  for (const name of toolNames) {
    assert.ok(body.includes(name), name);
  }
  assert.match(body, /imgcode/);
  assert.match(body, /imgid/);
  assert.match(body, /100/);
  assert.match(body, /收费/);
  const investigation = skills.find(
    (skill) => skill.name === "investigate-content"
  );
  assert.ok(investigation);
  assert.match(await readSkillFile(investigation, "SKILL.md"), /## 调查方法/);
});

test("MCP transport rejects redirects instead of forwarding a loopback connection elsewhere", async () => {
  const { createServer } = await import("node:http");
  let redirectedCalls = 0;
  const fixture = createServer((request, response) => {
    if (request.url === "/mcp") {
      response.writeHead(302, { Location: "/unexpected" }).end();
    } else {
      redirectedCalls += 1;
      response.end("should not be reached");
    }
  });
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  const address = fixture.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/mcp`;
  const keys = [
    "AGENT_CONFIG_PATH",
    "PORTA_MCP_URL",
    "PORTA_SERVICE_TOKEN",
    "TAVILY_API_KEY",
    "NODE_ENV",
    "AGENT_MCP_ALLOW_LOOPBACK_HTTP",
  ];
  const previous = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) {
      delete process.env[key];
    }
    process.env.PORTA_MCP_URL = url;
    process.env.PORTA_SERVICE_TOKEN = "fixture-service-token";
    Object.assign(process.env, { NODE_ENV: "test" });
    process.env.AGENT_MCP_ALLOW_LOOPBACK_HTTP = "1";
    const runtime = await createAgentRuntime(
      new AbortController().signal,
      (async ({ transport }) => {
        assert.ok("type" in transport && transport.type === "http");
        if (transport.url === url) {
          assert.ok(transport.fetch);
          await transport.fetch(url);
        }
        return {
          close: async () => undefined,
          tools: async () => ({}),
        } as unknown as MCPClient;
      }) as typeof createMCPClient
    );
    assert.equal(
      redirectedCalls,
      0,
      "redirects must not evade endpoint validation"
    );
    assert.match(
      runtime.instructions,
      /Porta.*connection or tool discovery failed/
    );
    await runtime.close();
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[index];
      }
    });
    fixture.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      fixture.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

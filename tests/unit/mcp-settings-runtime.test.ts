// biome-ignore-all lint/suspicious/useAwait: Deterministic offline fakes implement asynchronous production contracts.
// biome-ignore-all lint/style/noNonNullAssertion: Assertions establish fixture values before use.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MCPClient } from "@ai-sdk/mcp";
import { agentConfigSchema } from "../../lib/agent/config";
import { capabilityServers } from "../../lib/agent/mcp-settings/projection";
import {
  mergeManagedConfig,
  toolAlias,
} from "../../lib/agent/mcp-settings/runtime-config";
import { createAgentRuntime } from "../../lib/agent/runtime";

test("native dot/128 names have stable bounded aliases, legacy aliases preserved", () => {
  assert.equal(toolAlias("exa", "search"), "exa__search");
  assert.match(toolAlias("fixture", "search.web"), /^[a-zA-Z0-9_-]{1,64}$/);
  assert.notEqual(
    toolAlias("fixture", "search.web"),
    toolAlias("fixture", "search_web")
  );
  assert.equal(toolAlias("fixture", "a".repeat(128)).length, 64);
  assert.equal(
    agentConfigSchema.safeParse({
      servers: [
        {
          allowedTools: ["search.web"],
          id: "x",
          name: "X",
          url: "https://fixture.example",
        },
      ],
    }).success,
    true
  );
});
test("new tasks snapshot enabled managed tools, all require approval, prior task unaffected, legacy stays intact", async () => {
  const file = agentConfigSchema.parse({ servers: [] });
  let current = mergeManagedConfig(file, [
    {
      allowedTools: ["search.web"],
      enabled: true,
      headers: { Authorization: "Bearer SECRET" },
      id: "fixture",
      name: "Fixture",
      url: "https://fixture.example/mcp?token=SECRET",
    },
  ]);
  const savedOrigin = process.env.MCP_ALLOWED_ORIGINS;
  process.env.MCP_ALLOWED_ORIGINS = "https://fixture.example";
  let executed = 0,
    closed = 0;
  const connect = async () =>
    ({
      callTool: () => {
        executed += 1;
        throw new Error(
          "https://fixture.example/mcp?token=SECRET Bearer SECRET"
        );
      },
      close: async () => {
        closed += 1;
      },
      listTools: async () => ({
        tools: [
          {
            description: "Search",
            inputSchema: {
              properties: { query: { type: "string" } },
              type: "object",
            },
            name: "search.web",
          },
        ],
      }),
    }) as unknown as MCPClient;
  try {
    const first = await createAgentRuntime(
      new AbortController().signal,
      connect,
      async () => current
    );
    const alias = toolAlias("fixture", "search.web");
    assert.equal(first.tools[alias].needsApproval, true);
    assert.equal(executed, 0);
    current = mergeManagedConfig(file, [
      {
        allowedTools: ["search.web"],
        enabled: false,
        headers: {},
        id: "fixture",
        name: "Fixture",
        url: "https://fixture.example/mcp",
      },
    ]);
    const next = await createAgentRuntime(
      new AbortController().signal,
      connect,
      async () => current
    );
    assert.equal(next.tools[alias], undefined);
    assert.ok(first.tools[alias]);
    await assert.rejects(
      async () =>
        first.tools[alias].execute?.(
          {},
          { context: {}, messages: [], toolCallId: "x" }
        ),
      (e) => e instanceof Error && !e.message.includes("SECRET")
    );
    assert.ok(
      !JSON.stringify(capabilityServers(first.config.servers)).includes(
        "SECRET"
      )
    );
    await first.close();
    await next.close();
    assert.equal(closed, 1);
    const legacy = agentConfigSchema.parse({
      servers: [
        {
          allowedTools: ["search.web"],
          autoApproveTools: ["search.web"],
          id: "exa",
          name: "Exa",
          url: "https://legacy.example",
        },
      ],
    });
    assert.deepEqual(mergeManagedConfig(legacy, []).servers, legacy.servers);
  } finally {
    if (savedOrigin === undefined) {
      delete process.env.MCP_ALLOWED_ORIGINS;
    } else {
      process.env.MCP_ALLOWED_ORIGINS = savedOrigin;
    }
  }
});
test("managed runtime uses raw native schema without SDK additionalProperties rewriting and native callTool mapping", async () => {
  const raw = {
    additionalProperties: { type: "string" as const },
    properties: { q: { type: "string" as const } },
    type: "object" as const,
  };
  const current = mergeManagedConfig(agentConfigSchema.parse({ servers: [] }), [
    {
      allowedTools: ["search.web"],
      enabled: true,
      headers: {},
      id: "raw",
      name: "Raw",
      url: "https://fixture.example/mcp",
    },
  ]);
  const previous = process.env.MCP_ALLOWED_ORIGINS;
  process.env.MCP_ALLOWED_ORIGINS = "https://fixture.example";
  let rawListed = 0,
    called = 0;
  const connect = async () =>
    ({
      callTool: async (input: unknown) => {
        called += 1;
        assert.equal((input as { name: string }).name, "search.web");
        return { content: [] };
      },
      close: async () => undefined,
      listTools: async () => {
        rawListed += 1;
        return {
          tools: [
            { description: "Search", inputSchema: raw, name: "search.web" },
          ],
        };
      },
      tools: async () => {
        throw new Error("SDK automatic schema conversion must not run");
      },
    }) as unknown as MCPClient;
  try {
    const runtime = await createAgentRuntime(
      new AbortController().signal,
      connect,
      async () => current
    );
    const tool = runtime.tools[toolAlias("raw", "search.web")];
    assert.ok(tool);
    assert.deepEqual(
      (tool.inputSchema as { jsonSchema: unknown }).jsonSchema,
      raw
    );
    await tool.execute!(
      { extra: "allowed", q: "x" },
      { context: {}, messages: [], toolCallId: "raw" }
    );
    assert.equal(rawListed, 1);
    assert.equal(called, 1);
    await runtime.close();
  } finally {
    if (previous === undefined) {
      delete process.env.MCP_ALLOWED_ORIGINS;
    } else {
      process.env.MCP_ALLOWED_ORIGINS = previous;
    }
  }
});
test("pending managed execute obeys per-call abort even when SDK RPC ignores it; isError and rejected promises are sanitized", async () => {
  const previous = process.env.MCP_ALLOWED_ORIGINS;
  process.env.MCP_ALLOWED_ORIGINS = "https://fixture.example";
  const config = mergeManagedConfig(agentConfigSchema.parse({ servers: [] }), [
    {
      allowedTools: ["search.web"],
      enabled: true,
      headers: { Authorization: "Bearer SECRET" },
      id: "pending",
      name: "Pending",
      url: "https://fixture.example/mcp?token=SECRET",
    },
  ]);
  let mode = "pending";
  const connect = async () =>
    ({
      callTool: () =>
        mode === "pending"
          ? new Promise(() => {
              /* Stalled call. */
            })
          : mode === "error"
            ? Promise.resolve({
                content: [{ text: "SECRET", type: "text" }],
                isError: true,
              })
            : Promise.reject(new Error("SECRET")),
      close: async () => undefined,
      listTools: async () => ({
        tools: [{ inputSchema: { type: "object" }, name: "search.web" }],
      }),
    }) as unknown as MCPClient;
  try {
    const runtime = await createAgentRuntime(
      new AbortController().signal,
      connect,
      async () => config
    );
    const tool = runtime.tools[toolAlias("pending", "search.web")];
    assert.ok(tool.execute);
    const controller = new AbortController();
    const operation = tool.execute(
      {},
      {
        abortSignal: controller.signal,
        context: {},
        messages: [],
        toolCallId: "pending",
      }
    );
    const timer = setTimeout(() => controller.abort(), 10);
    try {
      await assert.rejects(
        () => operation as Promise<unknown>,
        (error) => error instanceof Error && !error.message.includes("SECRET")
      );
    } finally {
      clearTimeout(timer);
    }
    for (const value of ["error", "reject"]) {
      mode = value;
      // biome-ignore lint/performance/noAwaitInLoops: Mutate one fake mode and assert each sanitized result sequentially.
      await assert.rejects(
        () =>
          tool.execute!(
            {},
            { context: {}, messages: [], toolCallId: value }
          ) as Promise<unknown>,
        (error) => error instanceof Error && !error.message.includes("SECRET")
      );
    }
    await runtime.close();
  } finally {
    if (previous === undefined) {
      delete process.env.MCP_ALLOWED_ORIGINS;
    } else {
      process.env.MCP_ALLOWED_ORIGINS = previous;
    }
  }
});

test("capability aliases use the runtime identity and expose no connection secrets", () => {
  const server = {
    ...agentConfigSchema.parse({
      servers: [
        {
          allowedTools: ["search.web", "research_delete"],
          headers: { Authorization: "secret-sentinel" },
          id: "fixture",
          name: "Readable provider",
          url: "https://fixture.example",
        },
      ],
    }).servers[0],
  };
  const result = capabilityServers([server]);
  assert.deepEqual(result[0].toolAliases, [
    {
      alias: toolAlias("fixture", "search.web"),
      name: "search.web",
      serverName: "Readable provider",
    },
    {
      alias: toolAlias("fixture", "research_delete"),
      name: "research_delete",
      serverName: "Readable provider",
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(result),
    /secret-sentinel|fixture\.example|Authorization/
  );
});

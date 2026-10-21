// biome-ignore-all lint/suspicious/useAwait: Deterministic offline fakes implement asynchronous production contracts.
// biome-ignore-all lint/style/noNonNullAssertion: Assertions establish fixture values before use.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MCPClient } from "@ai-sdk/mcp";
import { discoverConnection } from "../../lib/agent/mcp-settings/discovery";
import type {
  SettingsRepository,
  SettingsRow,
} from "../../lib/agent/mcp-settings/repository";
import { createSettingsService } from "../../lib/agent/mcp-settings/service";

const env = {
  MCP_ALLOWED_ORIGINS: "https://fixture.example",
  MCP_SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};
const connection = {
  headers: { Authorization: "Bearer SECRET" },
  url: "https://fixture.example/private?token=SECRET",
};
function memory(): SettingsRepository {
  let row: SettingsRow | null = null;
  return {
    compareAndSwap: async (expected, next) => {
      if ((row?.revision ?? 0) !== expected) {
        return false;
      }
      row = next;
      return true;
    },
    read: async () => row,
  };
}
const server = {
  allowedTools: ["search.web"],
  connection: { mode: "replace" as const, value: connection },
  enabled: true,
  id: "fixture",
  name: "Fixture",
};
test("CAS CRUD persists encrypted list, redacts projections, keep retains secrets; replace replaces all", async () => {
  const repository = memory();
  let discovery = 0;
  const service = createSettingsService({
    discover: async (c) => {
      discovery += 1;
      assert.equal(c.headers.Authorization, connection.headers.Authorization);
      return [{ description: "Search", name: "search.web" }];
    },
    env,
    repository,
  });
  await service.mutate({ action: "save", revision: 0, server }, "ADMIN", []);
  assert.ok(!JSON.stringify(await repository.read()).includes("SECRET"));
  const projection = await service.get([]);
  assert.equal(projection.revision, 1);
  assert.equal(projection.servers[0].origin, "https://fixture.example");
  assert.ok(!JSON.stringify(projection).includes("SECRET"));
  await assert.rejects(
    () =>
      service.mutate(
        { action: "toggle", enabled: false, id: "fixture", revision: 0 },
        "ADMIN",
        []
      ),
    /配置已更新/
  );
  await service.mutate(
    {
      action: "save",
      revision: 1,
      server: { ...server, connection: { mode: "keep" }, name: "Edited" },
    },
    "ADMIN",
    []
  );
  assert.equal(discovery, 2);
  assert.equal(
    (await service.load())[0].headers.Authorization,
    connection.headers.Authorization
  );
  await service.mutate(
    { action: "toggle", enabled: false, id: "fixture", revision: 2 },
    "ADMIN",
    []
  );
  assert.equal((await service.load())[0].enabled, false);
  await assert.rejects(() =>
    service.mutate(
      {
        action: "save",
        revision: 3,
        server: { ...server, allowedTools: ["not_real"] },
      },
      "ADMIN",
      []
    )
  );
  await assert.rejects(() =>
    service.mutate({ action: "save", revision: 3, server }, "ADMIN", [
      {
        ...server,
        autoApproveTools: [],
        headers: {},
        url: connection.url,
      } as never,
    ])
  );
  const replacement = createSettingsService({
    discover: async (c) => {
      assert.deepEqual(c.headers, {});
      return [{ description: "Search", name: "search.web" }];
    },
    env,
    repository,
  });
  await replacement.mutate(
    {
      action: "save",
      revision: 3,
      server: {
        ...server,
        connection: {
          mode: "replace",
          value: { headers: {}, url: "https://fixture.example/new" },
        },
      },
    },
    "ADMIN",
    []
  );
  assert.deepEqual((await replacement.load())[0].headers, {});
  await service.mutate(
    { action: "delete", id: "fixture", revision: 4 },
    "ADMIN",
    []
  );
  assert.deepEqual(await service.load(), []);
});
test("discovery initializes/lists, never calls tools, and closes even on malformed metadata/error", async () => {
  let calls = 0,
    closed = 0,
    listed = 0;
  const fake = async () =>
    ({
      close: async () => {
        closed += 1;
      },
      listTools: async () => {
        listed += 1;
        return {
          tools: [
            {
              description: "Search",
              inputSchema: { type: "object" },
              name: "search.web",
            },
          ],
        };
      },
    }) as unknown as MCPClient;
  assert.deepEqual(await discoverConnection(connection, env, fake), [
    { description: "Search", name: "search.web" },
  ]);
  assert.equal(calls, 0);
  assert.equal(closed, 1);
  assert.equal(listed, 1);
  const broken = async () =>
    ({
      close: async () => {
        closed += 1;
      },
      listTools: async () => {
        throw new Error(connection.url);
      },
    }) as unknown as MCPClient;
  await assert.rejects(
    () => discoverConnection(connection, env, broken),
    (e) => e instanceof Error && !e.message.includes("SECRET")
  );
  assert.equal(closed, 2);
  const huge = async () =>
    ({
      close: async () => {
        closed += 1;
      },
      listTools: async () => ({
        tools: Array.from({ length: 129 }, (_, index) => ({
          inputSchema: { type: "object" },
          name: String(index),
        })),
      }),
    }) as unknown as MCPClient;
  await assert.rejects(() => discoverConnection(connection, env, huge));
  assert.equal(closed, 3);
});
test("concurrent saves exactly one wins; stored corruption and repository failure are fatal", async () => {
  const repository = memory(),
    service = createSettingsService({
      discover: async () => [{ description: "x", name: "search.web" }],
      env,
      repository,
    });
  const results = await Promise.allSettled([
    service.mutate({ action: "save", revision: 0, server }, "ADMIN", []),
    service.mutate({ action: "save", revision: 0, server }, "ADMIN", []),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const row = (await repository.read())!;
  await repository.compareAndSwap(1, {
    ...row,
    encrypted: "tampered",
    revision: 2,
  });
  await assert.rejects(() => service.load());
  const failing = createSettingsService({
    env,
    repository: {
      compareAndSwap: async () => false,
      read: async () => {
        throw new Error("db");
      },
    },
  });
  await assert.rejects(() => failing.load());
});
test("discovery cancellation settles even when SDK list never resolves; late initialization is closed", async () => {
  const controller = new AbortController();
  let closed = 0;
  const pending = async () =>
    ({
      close: async () => {
        closed += 1;
      },
      listTools: () =>
        new Promise(() => {
          /* Intentionally stalled SDK fixture. */
        }),
      tools: () =>
        new Promise(() => {
          /* Intentionally stalled SDK fixture. */
        }),
    }) as unknown as MCPClient;
  const operation = discoverConnection(
    connection,
    env,
    pending,
    controller.signal
  );
  const timer = setTimeout(() => controller.abort(), 15);
  try {
    const result = await Promise.race([
      operation.then(
        () => "resolved",
        () => "rejected"
      ),
      new Promise((resolve) => setTimeout(() => resolve("still_pending"), 100)),
    ]);
    assert.equal(result, "rejected");
    assert.equal(closed, 1);
  } finally {
    clearTimeout(timer);
  }
  const delayedController = new AbortController();
  let resolveClient!: (value: MCPClient) => void;
  const delayed = () =>
    new Promise<MCPClient>((resolve) => {
      resolveClient = resolve;
    });
  const late = discoverConnection(
    connection,
    env,
    delayed,
    delayedController.signal
  );
  await new Promise((resolve) => setTimeout(resolve, 1));
  delayedController.abort();
  await assert.rejects(() => late);
  resolveClient({
    close: async () => {
      closed += 1;
    },
  } as unknown as MCPClient);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(closed, 2);
});

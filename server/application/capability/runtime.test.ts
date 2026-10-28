// biome-ignore-all lint/suspicious/useAwait: 离线能力目录和范围仓储。
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScopeSnapshot } from "@/server/domain/capability/schema";
import type { ScopeRepository } from "@/server/infrastructure/persistence/drizzle/capability-repository";

test("任务选择按属主目录过滤、显式空集、沿用范围、拒绝续跑扩大及旧代执行", async () => {
  const feature = await import("./runtime").catch(() => null);
  assert.ok(feature, "需要按用户装配能力的运行时服务");
  let scope: ScopeSnapshot | null = null;
  const scopes: ScopeRepository = {
    bind: async (_u, _c, expected, next) => {
      assert.equal(expected, scope?.revision ?? 0);
      scope = { revision: expected + 1, ...next };
      return scope;
    },
    read: async () => scope,
  };
  let version = "v1";
  const load = async () => ({
    config: {
      maxOutputTokens: 512,
      maxSteps: 2,
      servers: [
        {
          allowedTools: ["run"],
          authorizationVersion: version,
          autoApproveTools: [],
          capabilityId: "personal:fixture",
          headers: {},
          id: "personal:fixture",
          managed: true,
          name: "个人连接",
          url: "https://fixture.example",
        },
      ],
      timeoutMs: 1000,
      toolTimeoutMs: 1000,
    },
    grants: { "server:personal:fixture": version },
    skills: [],
  });
  const service = feature.createTaskCapabilityService({
    chatId: "chat",
    load,
    scopes,
    userId: "A",
  });
  await assert.rejects(() =>
    service.prepare({ serverIds: ["someone-else"], skillIds: [] }, false)
  );
  const initial = await service.prepare(undefined, false);
  assert.equal(initial.config.servers.length, 1);
  await initial.assertCurrent("server:personal:fixture");
  version = "v2";
  await assert.rejects(() => initial.assertCurrent("server:personal:fixture"));
  version = "v1";
  const empty = await service.prepare({ serverIds: [], skillIds: [] }, false);
  assert.equal(empty.config.servers.length, 0);
  await assert.rejects(() => initial.assertCurrent("server:personal:fixture"));
  assert.equal(
    (await service.prepare(undefined, false)).config.servers.length,
    0
  );
  assert.equal(
    (
      await service.prepare(
        { serverIds: ["personal:fixture"], skillIds: [] },
        true
      )
    ).config.servers.length,
    0
  );
});
test("现有 Agent runtime 和 skill loader 每次执行检查权限，个人别名绑定版本", async () => {
  const { createAgentRuntime } = await import(
    "@/server/infrastructure/mcp/runtime"
  );
  const { createSkillTools } = await import(
    "@/server/infrastructure/mcp/skills"
  );
  let allowed = true,
    calls = 0,
    checks = 0;
  const config = {
    maxOutputTokens: 512,
    maxSteps: 2,
    servers: [
      {
        allowedTools: ["run"],
        authorizationVersion: "v1",
        autoApproveTools: [],
        capabilityId: "personal:fixture",
        headers: {},
        id: "personal:fixture",
        managed: true,
        name: "个人",
        personal: true,
        url: "https://fixture.example",
      },
    ],
    timeoutMs: 1000,
    toolTimeoutMs: 1000,
  };
  const previous = process.env.MCP_ALLOWED_ORIGINS;
  process.env.MCP_ALLOWED_ORIGINS = "https://fixture.example";
  try {
    const runtime = await createAgentRuntime(
      new AbortController().signal,
      async () =>
        ({
          callTool: async () => {
            calls += 1;
            return { content: [] };
          },
          close: async () => undefined,
          listTools: async () => ({
            tools: [{ inputSchema: { type: "object" }, name: "run" }],
          }),
        }) as any,
      async () => config,
      {
        authorizeTool: async () => {
          checks += 1;
          if (!allowed) {
            throw new Error("revoked");
          }
        },
        skills: [],
      } as any
    );
    const alias = Object.keys(runtime.tools).find((id) =>
      id.includes("fixture")
    );
    assert.ok(alias);
    assert.ok(alias.includes("v1"));
    allowed = false;
    await assert.rejects(
      () =>
        runtime.tools[alias].execute?.(
          {},
          { context: {}, messages: [], toolCallId: "one" }
        ) as Promise<unknown>
    );
    assert.equal(calls, 0);
    assert.ok(checks >= 2);
    await runtime.close();
    const skills = createSkillTools(
      [
        {
          description: "方法",
          directory: "",
          markdown: "---\nname: method\ndescription: 方法\n---\n指令",
          name: "method",
        },
      ],
      async () => {
        throw new Error("revoked");
      }
    );
    await assert.rejects(
      () =>
        skills.loadSkill.execute?.(
          { name: "method" },
          { context: {}, messages: [], toolCallId: "s" }
        ) as Promise<unknown>
    );
  } finally {
    if (previous === undefined) {
      delete process.env.MCP_ALLOWED_ORIGINS;
    } else {
      process.env.MCP_ALLOWED_ORIGINS = previous;
    }
  }
});
test("审批续跑拒绝已保存授权版本变化，即使客户端传入新能力也不扩权", async () => {
  const { createTaskCapabilityService } = await import("./runtime");
  const snapshot: ScopeSnapshot = {
    grants: { "server:x": "old" },
    revision: 4,
    selection: { serverIds: ["x"], skillIds: [] },
  };
  const scopes: ScopeRepository = {
    bind: async () => {
      throw new Error("不得重绑续跑");
    },
    read: async () => snapshot,
  };
  const service = createTaskCapabilityService({
    chatId: "c",
    load: async () => ({
      config: {
        maxOutputTokens: 512,
        maxSteps: 1,
        servers: [
          {
            allowedTools: [],
            autoApproveTools: [],
            headers: {},
            id: "x",
            name: "x",
            url: "https://fixture.example",
          },
        ],
        timeoutMs: 1000,
        toolTimeoutMs: 1000,
      },
      grants: { "server:x": "new" },
      skills: [],
    }),
    scopes,
    userId: "A",
  });
  await assert.rejects(
    () => service.prepare({ serverIds: [], skillIds: [] }, true),
    /旧审批/
  );
});
test("越权范围在用户消息持久化与任务绑定之前失败", async () => {
  const { createTaskCapabilityService } = await import("./runtime");
  let writes = 0;
  const service = createTaskCapabilityService({
    chatId: "new",
    load: async () => ({
      config: {
        maxOutputTokens: 512,
        maxSteps: 1,
        servers: [],
        timeoutMs: 1000,
        toolTimeoutMs: 1000,
      },
      grants: {},
      skills: [],
    }),
    scopes: {
      bind: async () => {
        throw new Error("不得绑定无效范围");
      },
      read: async () => null,
    },
    userId: "A",
  });
  await assert.rejects(() =>
    service.prepare({ serverIds: ["other"], skillIds: [] }, false, async () => {
      writes += 1;
    })
  );
  assert.equal(writes, 0);
  const valid = createTaskCapabilityService({
    chatId: "new",
    load: async () => ({
      config: {
        maxOutputTokens: 512,
        maxSteps: 1,
        servers: [],
        timeoutMs: 1000,
        toolTimeoutMs: 1000,
      },
      grants: {},
      skills: [],
    }),
    scopes: {
      bind: async (_u, _c, _e, next) => ({ revision: 1, ...next }),
      read: async () => null,
    },
    userId: "A",
  });
  await valid.prepare({ serverIds: [], skillIds: [] }, false, async () => {
    writes += 1;
  });
  assert.equal(writes, 1);
});
test("缺少服务端原范围的旧审批不能默认获取新添个人能力", async () => {
  const { createTaskCapabilityService } = await import("./runtime");
  const service = createTaskCapabilityService({
    chatId: "legacy",
    load: async () => ({
      config: {
        maxOutputTokens: 512,
        maxSteps: 1,
        servers: [],
        timeoutMs: 1000,
        toolTimeoutMs: 1000,
      },
      grants: {},
      skills: [],
    }),
    scopes: {
      bind: async (_u, _c, _e, next) => ({ revision: 1, ...next }),
      read: async () => null,
    },
    userId: "A",
  });
  await assert.rejects(() => service.prepare(undefined, true), /原范围/);
});

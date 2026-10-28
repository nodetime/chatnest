// biome-ignore-all lint/suspicious/useAwait: 离线内存仓储。
import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  SettingsRepository,
  SettingsRow,
} from "@/server/infrastructure/persistence/drizzle/mcp-settings-repository";
import { createSettingsService } from "./service";

const env = {
  MCP_ALLOWED_ORIGINS: "https://fixture.example",
  MCP_SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString("base64"),
};
test("个人 MCP 密文绑定属主，原有 service 可注入加密域", async () => {
  let row: SettingsRow | null = null;
  const repository: SettingsRepository = {
    compareAndSwap: async (expected, next) => {
      if ((row?.revision ?? 0) !== expected) {
        return false;
      }
      row = next;
      return true;
    },
    read: async () => row,
  };
  const make = (owner: string) =>
    createSettingsService({
      cryptoDomain: `personal-mcp:${owner}`,
      discover: async () => [{ description: "搜索", name: "search" }],
      env,
      repository,
    } as Parameters<typeof createSettingsService>[0]);
  await make("A").mutate(
    {
      action: "save",
      revision: 0,
      server: {
        allowedTools: ["search"],
        connection: {
          mode: "replace",
          value: {
            headers: { Authorization: "PRIVATE" },
            url: "https://fixture.example/mcp?token=PRIVATE",
          },
        },
        enabled: true,
        id: "fixture",
        name: "测试",
      },
    },
    "A",
    []
  );
  assert.ok(!JSON.stringify(row).includes("PRIVATE"));
  assert.equal((await make("A").load()).length, 1);
  await assert.rejects(() => make("B").load());
});
test("个人技能解析与范围规则已提供，可拒绝脚本格式和越权选择", async () => {
  const feature = await import("@/server/domain/capability/schema").catch(
    () => null
  );
  assert.ok(feature, "需要个人能力领域校验模块");
  const skill = feature.parseSkillMarkdown(
    "---\nname: local-method\ndescription: 本地方法\n---\n按证据工作。"
  );
  assert.equal(skill.name, "local-method");
  assert.throws(() =>
    feature.parseSkillMarkdown(
      "---\nname: local-method\ndescription: x\ncommand: sh setup.sh\n---\nx"
    )
  );
  assert.throws(() =>
    feature.parseSkillMarkdown("---js\nthrow new Error('execute')\n---\nx")
  );
  assert.deepEqual(
    feature.resolveSelection(
      { serverIds: [], skillIds: [] },
      ["platform"],
      ["builtin:method"]
    ),
    { serverIds: [], skillIds: [] }
  );
  assert.throws(() =>
    feature.resolveSelection(
      { serverIds: ["other-owner"], skillIds: [] },
      ["platform"],
      []
    )
  );
});
test("标准技能扩展元数据只作为数据，不启用执行型 frontmatter", async () => {
  const { parseSkillMarkdown } = await import(
    "@/server/domain/capability/schema"
  );
  assert.equal(
    parseSkillMarkdown(
      "---\nname: method\ndescription: 方法\nversion: 1.0.0\nhomepage: https://fixture.example\nmetadata:\n  author: Test\n---\n按需处理。 "
    ).name,
    "method"
  );
  assert.throws(() => parseSkillMarkdown("---coffee\nthrow 'execute'\n---\nx"));
});

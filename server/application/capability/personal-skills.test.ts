// biome-ignore-all lint/suspicious/useAwait: 离线内存仓储。
import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  SettingsRepository,
  SettingsRow,
} from "@/server/infrastructure/persistence/drizzle/mcp-settings-repository";

const markdown =
  "---\nname: local-method\ndescription: 本地方法\n---\n仅阅读证据，不运行脚本。";
const env = {
  MCP_SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64"),
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
test("个人技能 CRUD、启停、冲突与属主密文隔离", async () => {
  const feature = await import("./personal-skills").catch(() => null);
  assert.ok(feature, "需要个人技能服务");
  const repository = memory();
  const service = feature.createPersonalSkillsService({
    builtins: async () => [],
    env,
    repository,
    userId: "A",
  });
  assert.equal(
    (await service.execute({ action: "preview", markdown })).name,
    "local-method"
  );
  await service.execute({
    action: "save",
    enabled: true,
    id: "local-method",
    markdown,
    revision: 0,
  });
  const catalog = await service.get();
  assert.equal(catalog.revision, 1);
  assert.equal(catalog.skills[0].id, "personal:local-method");
  assert.ok(!JSON.stringify(catalog).includes("仅阅读证据"));
  assert.ok(!JSON.stringify(await repository.read()).includes("仅阅读证据"));
  assert.equal(
    (await service.execute({ action: "read", id: "personal:local-method" }))
      .markdown,
    markdown
  );
  await assert.rejects(() =>
    service.execute({
      action: "toggle",
      enabled: false,
      id: "local-method",
      revision: 0,
    })
  );
  await service.execute({
    action: "toggle",
    enabled: false,
    id: "local-method",
    revision: 1,
  });
  assert.equal((await service.get()).skills[0].enabled, false);
  await assert.rejects(() =>
    feature
      .createPersonalSkillsService({
        builtins: async () => [],
        env,
        repository,
        userId: "B",
      })
      .get()
  );
  await service.execute({ action: "delete", id: "local-method", revision: 2 });
  assert.equal((await service.get()).skills.length, 0);
});
test("内置技能按用户启停，不改部署目录且可建立单文件个人副本", async () => {
  const { createPersonalSkillsService } = await import("./personal-skills");
  const { discoverSkills } = await import("@/server/infrastructure/mcp/skills");
  const builtin = (await discoverSkills()).find(
    (item) => item.name === "porta"
  );
  assert.ok(builtin);
  const service = createPersonalSkillsService({
    builtins: async () => [builtin],
    env,
    repository: memory(),
    userId: "A",
  });
  await service.execute({
    action: "toggle",
    enabled: false,
    id: "builtin:porta",
    revision: 0,
  });
  assert.equal((await service.get()).skills[0].enabled, false);
  await service.execute({
    action: "copy",
    id: "builtin:porta",
    newId: "my-porta",
    revision: 1,
  });
  assert.equal((await service.get()).skills[1].id, "personal:my-porta");
});
test("导入格式错误映射为用户可修正的400，不作为服务端故障", async () => {
  const { createPersonalSkillsService } = await import("./personal-skills");
  const service = createPersonalSkillsService({
    builtins: async () => [],
    env,
    repository: memory(),
    userId: "A",
  });
  await assert.rejects(
    () => service.execute({ action: "preview", markdown: "not frontmatter" }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 400
  );
});

test("未配置个人加密时只读内置目录，保存给出可理解的未开放状态", async () => {
  const { createPersonalSkillsService } = await import("./personal-skills");
  const service = createPersonalSkillsService({
    builtins: async () => [],
    env: {},
    repository: memory(),
    userId: "A",
  });
  assert.equal((await service.get()).configured, false);
  await assert.rejects(
    () =>
      service.execute({
        action: "save",
        enabled: true,
        id: "method",
        markdown,
        revision: 0,
      }),
    /个人技能管理暂未开放/
  );
});

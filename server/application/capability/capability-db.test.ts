// biome-ignore-all lint/suspicious/useAwait: 测试回调用于模拟业务外发计数。
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const enabled = process.env.PERSONAL_CAPABILITY_DB_TEST === "1";
test("真实隔离库：个人同名配置隔离、属主范围校验、双提交审批最多一次ready", {
  skip: !enabled,
}, async () => {
  const url = new URL(process.env.POSTGRES_URL ?? "postgres://invalid");
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      url.pathname.includes("acceptance"),
    "仅允许显式本地 acceptance 数据库"
  );
  const [
    { db },
    schema,
    { personalSettingsRepository, scopeRepository },
    { messageRepository },
    { createSettingsService },
    { hasPendingInteraction },
    { eq, inArray },
  ] = await Promise.all([
    import("@/server/infrastructure/persistence/drizzle/client"),
    import("@/server/infrastructure/persistence/drizzle/schema"),
    import("@/server/infrastructure/persistence/drizzle/capability-repository"),
    import("@/server/infrastructure/persistence/drizzle/message-repository"),
    import("@/server/application/mcp/service"),
    import("@/server/domain/message/agent-interactions"),
    import("drizzle-orm"),
  ]);
  const a = randomUUID(),
    b = randomUUID(),
    chatId = randomUUID(),
    messageId = randomUUID();
  const env = {
    MCP_ALLOWED_ORIGINS: "https://fixture.example",
    MCP_SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("base64"),
  };
  try {
    await db.insert(schema.user).values([
      { email: `${a}@fixture.invalid`, id: a },
      { email: `${b}@fixture.invalid`, id: b },
    ]);
    await db.insert(schema.chat).values({
      createdAt: new Date(),
      id: chatId,
      title: "个人能力并发验收",
      userId: a,
      visibility: "private",
    });
    const make = (id: string) =>
      createSettingsService({
        cryptoDomain: `personal-mcp:${id}`,
        discover: async () => [{ description: "本地测试", name: "run" }],
        env,
        repository: personalSettingsRepository(id, "mcp"),
      });
    const save = (id: string, token: string) =>
      make(id).mutate(
        {
          action: "save",
          revision: 0,
          server: {
            allowedTools: ["run"],
            connection: {
              mode: "replace",
              value: {
                headers: { Authorization: token },
                url: "https://fixture.example/mcp",
              },
            },
            enabled: true,
            id: "same",
            name: "同名",
          },
        },
        id,
        []
      );
    await Promise.all([save(a, "A_PRIVATE"), save(b, "B_PRIVATE")]);
    assert.equal((await make(a).load())[0].headers.Authorization, "A_PRIVATE");
    assert.equal((await make(b).load())[0].headers.Authorization, "B_PRIVATE");
    const raw = await db
      .select()
      .from(schema.capabilitySettings)
      .where(inArray(schema.capabilitySettings.userId, [a, b]));
    assert.ok(!JSON.stringify(raw).includes("_PRIVATE"));
    await assert.rejects(() => scopeRepository.read(b, chatId));
    assert.equal(await scopeRepository.read(a, randomUUID()), null);
    const scope = await scopeRepository.bind(a, chatId, 0, {
      grants: { "server:personal:same": "v1" },
      selection: { serverIds: ["personal:same"], skillIds: [] },
    });
    assert.equal(scope.revision, 1);
    const parts = [
      {
        approval: { id: "approval" },
        input: { amount: 1 },
        state: "approval-requested",
        toolCallId: "call",
        toolName: "fixture__run",
        type: "dynamic-tool",
      },
    ];
    await db.insert(schema.message).values({
      attachments: [],
      chatId,
      createdAt: new Date(),
      id: messageId,
      parts,
      role: "assistant",
    });
    let externalCalls = 0;
    const respond = async () => {
      const merged = await messageRepository.mergeInteractionResponses({
        chatId,
        responses: [
          {
            id: messageId,
            parts: [
              {
                ...parts[0],
                approval: { approved: true, id: "approval" },
                state: "approval-responded",
              },
            ],
            role: "assistant",
          } as any,
        ],
        userId: a,
      });
      if (merged.changed && !hasPendingInteraction(merged.messages as any)) {
        externalCalls += 1;
      }
      return merged;
    };
    const results = await Promise.all([respond(), respond()]);
    assert.equal(results.filter((item) => item.changed).length, 1);
    assert.equal(externalCalls, 1);
    const [stored] = await db
      .select()
      .from(schema.message)
      .where(eq(schema.message.id, messageId));
    assert.equal((stored.parts as any[])[0].approval.approved, true);
    await assert.rejects(() =>
      messageRepository.mergeInteractionResponses({
        chatId,
        responses: [],
        userId: b,
      })
    );
  } finally {
    await db.delete(schema.message).where(eq(schema.message.chatId, chatId));
    await db.delete(schema.chat).where(eq(schema.chat.id, chatId));
    await db.delete(schema.user).where(inArray(schema.user.id, [a, b]));
    await db.$client.end({ timeout: 5 });
  }
});

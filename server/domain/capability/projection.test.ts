import assert from "node:assert/strict";
import { test } from "node:test";
import type { UIMessage } from "ai";

test("公开聊天投影不泄露个人技能原始指令，保留普通聊天与内置技能", async () => {
  const feature = await import("./projection").catch(() => null);
  assert.ok(feature, "需要个人技能共享投影");
  const messages = [
    {
      id: "m",
      parts: [
        { text: "正常回答", type: "text" },
        {
          input: { name: "personal:method" },
          output: { instructions: "PRIVATE_SKILL", name: "personal:method" },
          state: "output-available",
          type: "tool-loadSkill",
        },
        {
          input: { name: "porta" },
          output: { instructions: "PUBLIC_BUILTIN" },
          state: "output-available",
          type: "tool-loadSkill",
        },
      ],
    },
  ];
  const shared = feature.redactPersonalSkillOutputs(messages);
  assert.ok(!JSON.stringify(shared).includes("PRIVATE_SKILL"));
  assert.ok(JSON.stringify(shared).includes("PUBLIC_BUILTIN"));
  assert.ok(JSON.stringify(messages).includes("PRIVATE_SKILL"));
});
test("审批只接受存储assistant上与当前会话同代的范围标记", async () => {
  const feature = await import("./projection");
  assert.equal(typeof feature.hasCurrentCapabilityScope, "function");
  assert.equal(
    feature.hasCurrentCapabilityScope(
      [{ parts: [{ data: { revision: 2 }, type: "data-capability-scope" }] }],
      2
    ),
    true
  );
  assert.equal(
    feature.hasCurrentCapabilityScope(
      [{ parts: [{ data: { revision: 1 }, type: "data-capability-scope" }] }],
      2
    ),
    false
  );
  assert.equal(feature.hasCurrentCapabilityScope([{ parts: [] }], 2), false);
});

test("本轮模型历史仅重放技能元数据，同标识编辑及停用不复用旧正文，持久证据不变", async () => {
  const feature = await import("./projection");
  assert.equal(typeof feature.projectSkillHistoryForModel, "function");
  const messages = [
    {
      id: "a",
      parts: [
        { text: "已生成的正常成果", type: "text" },
        {
          input: { name: "personal:unselected" },
          output: {
            instructions: "PRIVATE_BODY_SENTINEL",
            name: "personal:unselected",
          },
          state: "output-available",
          toolCallId: "private",
          type: "tool-loadSkill",
        },
        {
          input: { name: "disabled-builtin", resource: "references/method.md" },
          output: { content: "DISABLED_RESOURCE", name: "disabled-builtin" },
          state: "output-available",
          toolCallId: "disabled",
          toolName: "readSkillResource",
          type: "dynamic-tool",
        },
        {
          input: { name: "selected-method" },
          output: {
            instructions: "OLD_SELECTED_BODY",
            name: "selected-method",
          },
          state: "output-available",
          toolCallId: "selected",
          type: "tool-loadSkill",
        },
      ],
      role: "assistant",
    },
  ];
  const original = JSON.stringify(messages);
  const projected = feature.projectSkillHistoryForModel(messages, [
    "selected-method",
  ]);
  assert.ok(!JSON.stringify(projected).includes("PRIVATE_BODY_SENTINEL"));
  assert.ok(!JSON.stringify(projected).includes("DISABLED_RESOURCE"));
  assert.ok(!JSON.stringify(projected).includes("OLD_SELECTED_BODY"));
  const projectedParts = projected[0].parts as unknown as {
    output?: { available: boolean };
  }[];
  assert.equal(projectedParts[1].output?.available, false);
  assert.equal(projectedParts[2].output?.available, false);
  assert.equal(projectedParts[3].output?.available, true);
  assert.ok(JSON.stringify(projected).includes("已生成的正常成果"));
  assert.equal(JSON.stringify(messages), original);
  const { convertToModelMessages } = await import("ai");
  const model = await convertToModelMessages(
    projected as unknown as UIMessage[],
    {
      ignoreIncompleteToolCalls: true,
    }
  );
  assert.ok(!JSON.stringify(model).includes("PRIVATE_BODY_SENTINEL"));
  assert.ok(!JSON.stringify(model).includes("DISABLED_RESOURCE"));
  assert.ok(!JSON.stringify(model).includes("OLD_SELECTED_BODY"));
  const empty = feature.projectSkillHistoryForModel(messages, []);
  assert.ok(!JSON.stringify(empty).includes("OLD_SELECTED_BODY"));
  const emptyParts = empty[0].parts as unknown as {
    output?: { available: boolean };
  }[];
  assert.equal(emptyParts[3].output?.available, false);
});

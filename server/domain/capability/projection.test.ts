import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelMessage, UIMessage } from "ai";

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

test("本轮续聊使用已授权技能的最新正文，停用技能和旧资源不重放，持久证据不变", async () => {
  const feature = await import("./projection");
  assert.equal(typeof feature.projectSkillContextForModel, "function");
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
  assert.deepEqual(
    [...feature.historicalSkillNames(messages)],
    ["personal:unselected", "disabled-builtin", "selected-method"]
  );
  assert.equal(
    feature.historicalSkillNames([
      { parts: [{ text: "selected-method", type: "text" }] },
    ]).size,
    0
  );
  const context = feature.projectSkillContextForModel(
    messages,
    new Map([["selected-method", "CURRENT_SELECTED_BODY"]])
  );
  const projected = context.messages;
  assert.ok(!JSON.stringify(projected).includes("PRIVATE_BODY_SENTINEL"));
  assert.ok(!JSON.stringify(projected).includes("DISABLED_RESOURCE"));
  assert.ok(!JSON.stringify(projected).includes("OLD_SELECTED_BODY"));
  const projectedParts = projected[0].parts as unknown as {
    output?: { available?: boolean; instructions?: string };
  }[];
  assert.equal(projectedParts[1].output?.available, false);
  assert.equal(projectedParts[2].output?.available, false);
  assert.equal(projectedParts[3].output?.available, true);
  assert.equal(projectedParts[3].output?.instructions, undefined);
  assert.equal(context.instructions.split("CURRENT_SELECTED_BODY").length, 2);
  assert.ok(context.instructions.includes("selected-method"));
  assert.ok(!context.instructions.includes("PRIVATE_BODY_SENTINEL"));
  assert.ok(!context.instructions.includes("DISABLED_RESOURCE"));
  assert.ok(!JSON.stringify(projected).includes("CURRENT_SELECTED_BODY"));
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
  assert.ok(!JSON.stringify(model).includes("CURRENT_SELECTED_BODY"));
  const { generateText } = await import("ai");
  const { MockLanguageModelV4 } = await import("ai/test");
  await generateText({
    instructions: context.instructions,
    messages: model,
    model: new MockLanguageModelV4({
      doGenerate: (options) => {
        const wire = JSON.stringify(options.prompt);
        assert.equal(wire.split("CURRENT_SELECTED_BODY").length, 2);
        assert.doesNotMatch(
          wire,
          /PRIVATE_BODY_SENTINEL|DISABLED_RESOURCE|OLD_SELECTED_BODY/
        );
        return Promise.resolve({
          content: [{ text: "已按当前技能处理", type: "text" as const }],
          finishReason: { raw: "stop", unified: "stop" as const },
          usage: {
            inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
            outputTokens: { reasoning: 0, text: 1, total: 1 },
          },
          warnings: [],
        });
      },
    }),
  });
  const emptyContext = feature.projectSkillContextForModel(messages, new Map());
  const empty = emptyContext.messages;
  assert.equal(emptyContext.instructions, "");
  assert.ok(!JSON.stringify(empty).includes("OLD_SELECTED_BODY"));
  const emptyParts = empty[0].parts as unknown as {
    output?: { available: boolean };
  }[];
  assert.equal(emptyParts[3].output?.available, false);
});

test("模型投影只去重已授权原生技能正文，保留其他工具、资源、失败和原始记录", async () => {
  const { projectLoadedSkillResultsForModel } = await import("./projection");
  const outputs = [
    ["loadSkill", { instructions: "BODY", name: "method", path: "method.md" }],
    ["loadSkill", { instructions: "BODY", name: "disabled" }],
    ["loadSkill", { instructions: "OTHER_BODY", name: "method" }],
    ["loadSkill", { error: "denied", name: "method" }],
    ["readSkillResource", { instructions: "BODY", name: "method" }],
    ["externalTool", { instructions: "BODY", name: "method" }],
  ] as const;
  const messages: ModelMessage[] = [
    {
      content: outputs.map(([toolName, value], i) => ({
        output: { type: "json", value },
        toolCallId: String(i),
        toolName,
        type: "tool-result",
      })),
      role: "tool",
    },
  ];
  const before = JSON.stringify(messages);
  const projected = projectLoadedSkillResultsForModel(
    messages,
    new Map([["method", "BODY"]])
  );
  assert.equal(JSON.stringify(messages), before);
  assert.equal(projected[0].role, "tool");
  if (projected[0].role !== "tool" || messages[0].role !== "tool") {
    return;
  }
  assert.doesNotMatch(JSON.stringify(projected[0].content[0]), /BODY/);
  assert.match(JSON.stringify(projected[0].content[0]), /method.md/);
  assert.deepEqual(projected[0].content.slice(1), messages[0].content.slice(1));
});

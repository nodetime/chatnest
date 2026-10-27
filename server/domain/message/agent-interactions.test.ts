import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyAskUserResponses,
  askUserInputSchema,
  compactInteractionResponses,
  deriveTaskProgress,
  hasPendingInteraction,
  interactionResponseSignature,
  sameInteractionValue,
  shouldContinueAgent,
  storedAskUserOutputs,
  todoPlanSchema,
} from "./agent-interactions";
import type { ChatMessage } from "./types";

const input = {
  questions: [
    { id: "goal", label: "目标", required: true, type: "text" },
    {
      id: "format",
      label: "格式",
      options: [
        { label: "文档", value: "doc" },
        { label: "表格", value: "table" },
      ],
      required: true,
      type: "single",
    },
    {
      id: "extras",
      label: "额外内容",
      options: [{ label: "来源", value: "sources" }],
      required: false,
      type: "multi",
    },
  ],
  title: "选择下一步",
};
const output = {
  answers: { extras: ["sources"], format: "table", goal: "调研" },
  status: "answered",
};
function pending(): ChatMessage {
  return {
    id: "assistant",
    parts: [
      {
        input,
        state: "input-available",
        toolCallId: "ask",
        type: "tool-askUser",
      },
    ],
    role: "assistant",
  } as ChatMessage;
}
function response(overrides = {}): ChatMessage[] {
  return [
    {
      id: "assistant",
      parts: [
        {
          input: { title: "client forgery" },
          output,
          state: "output-available",
          toolCallId: "ask",
          type: "tool-askUser",
          ...overrides,
        },
      ],
      role: "assistant",
    },
  ] as unknown as ChatMessage[];
}

test("通用 Ask 从存储输入验证答案，保留原问题并幂等合并", () => {
  assert.equal(typeof applyAskUserResponses, "function");
  const original = pending();
  const result = applyAskUserResponses([original], response());
  assert.equal(result.changed, true);
  const [part] = result.messages[0].parts;
  assert.deepEqual("input" in part && part.input, input);
  assert.deepEqual("output" in part && part.output, output);
  assert.equal(
    (original.parts[0] as { state: string }).state,
    "input-available"
  );
  assert.equal(
    applyAskUserResponses(result.messages, response()).changed,
    false
  );
  assert.throws(
    () =>
      applyAskUserResponses(
        result.messages,
        response({
          output: {
            ...output,
            answers: { ...output.answers, goal: "另一目标" },
          },
        })
      ),
    /response/i
  );
});

test("Ask 拒绝历史、未知调用、冒充 MCP 输出与无效答案", () => {
  for (const value of [
    response({ toolCallId: "other" }),
    response({ type: "tool-updateTodo" }),
    response({ toolName: "porta__write", type: "dynamic-tool" }),
    response({
      output: { ...output, answers: { ...output.answers, format: "evil" } },
    }),
    response({
      output: { ...output, answers: { ...output.answers, goal: "" } },
    }),
    response({
      output: { ...output, answers: { ...output.answers, unknown: "x" } },
    }),
    response({
      output: {
        ...output,
        answers: { ...output.answers, extras: ["sources", "sources"] },
      },
    }),
  ]) {
    assert.throws(() => applyAskUserResponses([pending()], value), /response/i);
  }
  assert.throws(
    () =>
      applyAskUserResponses(
        [
          pending(),
          { id: "new", parts: [{ text: "追问", type: "text" }], role: "user" },
        ],
        response()
      ),
    /response/i
  );
  const foreign = response();
  foreign[0].id = "foreign";
  assert.throws(() => applyAskUserResponses([pending()], foreign), /response/i);
});

test("取消 Ask 不伪造答案；部分 Ask 回答和待审批工具阻止模型续跑", () => {
  const cancelled = applyAskUserResponses(
    [pending()],
    response({ output: { answers: {}, status: "cancelled" } })
  );
  assert.equal(cancelled.changed, true);
  assert.throws(
    () =>
      applyAskUserResponses(
        [pending()],
        response({ output: { answers: { goal: "伪造" }, status: "cancelled" } })
      ),
    /response/i
  );
  assert.equal(hasPendingInteraction([pending()]), true);
  assert.equal(hasPendingInteraction(cancelled.messages), false);
  cancelled.messages[0].parts.push({
    approval: { id: "exact" },
    input: {},
    state: "approval-requested",
    toolCallId: "approve",
    toolName: "fixture__write",
    type: "dynamic-tool",
  });
  assert.equal(hasPendingInteraction(cancelled.messages), true);
  const mixed = structuredClone(cancelled.messages);
  const [, approval] = mixed[0].parts;
  if ("approval" in approval) {
    approval.state = "approval-responded";
    approval.approval = { approved: true, id: "exact" };
  }
  assert.equal(shouldContinueAgent(mixed, false, ""), true);
  assert.equal(shouldContinueAgent(mixed, true, ""), false);
  assert.equal(
    shouldContinueAgent(mixed, false, interactionResponseSignature(mixed)),
    false
  );
});

test("Todo 仅投影成功工具结果，返回最后规范快照，不从普通文字推断完成", () => {
  const plan = {
    items: [{ id: "one", status: "in_progress", title: "核对来源" }],
  };
  const messages = [
    {
      id: "a",
      parts: [
        {
          input: plan,
          output: plan,
          state: "output-available",
          toolCallId: "todo",
          type: "tool-updateTodo",
        },
      ],
      role: "assistant",
    },
  ] as unknown as ChatMessage[];
  assert.deepEqual(deriveTaskProgress(messages), plan);
  messages.push({
    id: "b",
    parts: [
      { text: "全部完成", type: "text" },
      {
        errorText: "failed",
        input: { items: [] },
        state: "output-error",
        toolCallId: "bad",
        type: "tool-updateTodo",
      },
    ],
    role: "assistant",
  } as ChatMessage);
  assert.deepEqual(deriveTaskProgress(messages), plan);
  assert.equal(
    todoPlanSchema.safeParse({
      items: [...plan.items, ...plan.items],
    }).success,
    false
  );
  assert.equal(
    askUserInputSchema.safeParse({
      ...input,
      questions: [input.questions[0], input.questions[0]],
    }).success,
    false
  );
});

test("transport 只发送最新 Ask 答案和审批决定，不重传输入或工具原始结果", () => {
  const messages = response();
  messages[0].parts.push({
    approval: { approved: false, id: "exact" },
    input: { private: "secret" },
    state: "approval-responded",
    toolCallId: "approve",
    toolName: "fixture__write",
    type: "dynamic-tool",
  });
  const compact = compactInteractionResponses([pending(), ...messages]);
  assert.equal(compact.length, 1);
  assert.equal(compact[0].parts.length, 2);
  assert.doesNotMatch(JSON.stringify(compact), /client forgery|private|secret/);
  assert.match(JSON.stringify(compact), /exact/);
});

test("持久化 JSONB 键顺序变化不影响相同答案幂等性或快照比较", () => {
  const result = applyAskUserResponses([pending()], response());
  const [part] = result.messages[0].parts;
  if (part.type === "tool-askUser" && part.state === "output-available") {
    part.output = {
      answers: { extras: ["sources"], format: "table", goal: "调研" },
      status: "answered",
    };
  }
  assert.equal(
    applyAskUserResponses(result.messages, response()).changed,
    false
  );
  assert.equal(
    sameInteractionValue(
      { a: 1, b: { x: 2, y: 3 } },
      { a: 1, b: { x: 2, y: 3 } }
    ),
    true
  );
});

test("并发页面补交答案时，下行重放仅规范Ask输出，让客户端同步其它已保存的回答", () => {
  const result = applyAskUserResponses([pending()], response());
  assert.deepEqual(storedAskUserOutputs(result.messages), [
    { output, toolCallId: "ask", type: "tool-output-available" },
  ]);
  assert.deepEqual(storedAskUserOutputs([pending()]), []);
});

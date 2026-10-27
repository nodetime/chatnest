import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  convertToModelMessages,
  createUIMessageStream,
  readUIMessageStream,
  tool,
} from "ai";
import type { ChatMessage } from "@/server/domain/message/types";
import { agentInteractionTools } from "./tools/agent-interactions";

test("askUser 是无 execute 的客户端工具；Todo 用经过规范校验的完整快照执行", async () => {
  assert.equal(typeof agentInteractionTools, "function");
  const definitions = agentInteractionTools();
  assert.equal(definitions.askUser.execute, undefined);
  assert.equal(definitions.askUser.needsApproval, undefined);
  assert.ok(definitions.askUser.inputSchema);
  const plan = {
    items: [{ id: "check", status: "in_progress" as const, title: "核对来源" }],
  };
  assert.ok(definitions.updateTodo.execute);
  const actual = await definitions.updateTodo.execute(plan, {
    context: {},
    messages: [],
    toolCallId: "todo",
  });
  assert.deepEqual(actual, plan);
});

test("SDK 续跑保持同一个 assistant 与原始问题，答案进入模型上下文", async () => {
  const input = {
    questions: [
      { id: "goal", label: "目标", required: true, type: "text" as const },
    ],
    title: "目标",
  };
  const output = { answers: { goal: "核对引用" }, status: "answered" as const };
  const original: ChatMessage = {
    id: "a",
    parts: [
      {
        input,
        output,
        state: "output-available",
        toolCallId: "ask",
        type: "tool-askUser",
      },
    ],
    role: "assistant",
  };
  let saved: ChatMessage | undefined;
  const stream = createUIMessageStream<ChatMessage>({
    execute: () => {
      /* 不追加生成内容，仅检查原消息恢复。 */
    },
    onEnd: ({ responseMessage }) => {
      saved = responseMessage;
    },
    originalMessages: [original],
  });
  for await (const _ of readUIMessageStream({
    message: structuredClone(original),
    stream,
  })) {
    /* actual SDK lifecycle */
  }
  assert.equal(saved?.id, "a");
  assert.deepEqual(saved?.parts, original.parts);
  const model = await convertToModelMessages([original], {
    tools: { askUser: tool(agentInteractionTools().askUser) },
  });
  assert.match(JSON.stringify(model), /核对引用/);
});

test("服务端在模型调用前事务保存 Ask，部分回答/重复提交不调用模型，完成写回有并发基线", () => {
  const source = readFileSync(
    new URL("./send-message.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /mergeInteractionResponses/);
  assert.ok(
    source.indexOf("messageRepo.mergeInteractionResponses") <
      source.indexOf("await getCapabilities")
  );
  assert.match(source, /hasPendingInteraction/);
  assert.match(source, /updateContinuationParts/);
  const repository = readFileSync(
    new URL(
      "../../infrastructure/persistence/drizzle/message-repository.ts",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(repository, /async mergeInteractionResponses/);
  assert.match(repository, /async updateContinuationParts/);
  assert.match(repository, /applyAskUserResponses/);
  assert.match(repository, /\.for\("update"\)/);
});

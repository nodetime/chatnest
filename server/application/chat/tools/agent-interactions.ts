import { tool } from "ai";
import {
  askUserInputSchema,
  askUserOutputSchema,
  todoPlanSchema,
} from "@/server/domain/message/agent-interactions";

/** 通用交互工具；是否规划或提问由 Agent 按当前证据决定，没有固定业务流程。 */
export function agentInteractionTools() {
  return {
    askUser: tool({
      description:
        "Ask the user for missing information or a decision using a short form. Choose text, single-choice, or multi-choice questions as appropriate. This pauses until the user answers or cancels. Do not use this tool to authorize other tools: MCP/browser authorization remains a separate approval gate. Use only when the answer is material; otherwise proceed with reasonable assumptions.",
      inputSchema: askUserInputSchema,
      outputSchema: askUserOutputSchema,
      // 无 execute：客户端提供答案，服务端根据原始已存储问题再次校验。
    }),
    updateTodo: tool({
      description:
        "Publish the current task progress as a complete replacement list. Use stable item IDs with pending, in_progress, or completed status; update only according to actual work and evidence. For multi-step tasks use a short useful plan and keep it current; do not invent completed actions. An empty list clears the plan. This is progress reporting, not authorization and not a fixed workflow.",
      execute: (input) => Promise.resolve(todoPlanSchema.parse(input)),
      inputSchema: todoPlanSchema,
      outputSchema: todoPlanSchema,
    }),
  };
}

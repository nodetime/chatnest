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
        "Ask for essential missing input or a user decision. Group 1-3 concise questions using text or meaningful choices, reusing answers already supplied. Pauses until the user answers or skips; a skipped question remains unanswered. Continue the task from the response. Tool approvals are handled by the host, not this form.",
      inputSchema: askUserInputSchema,
      outputSchema: askUserOutputSchema,
      // 无 execute：客户端提供答案，服务端根据原始已存储问题再次校验。
    }),
    updateTodo: tool({
      description:
        "Track substantive multi-step work with a short list of concrete outcomes. Send the complete replacement list with stable IDs and pending, in_progress or completed status; normally one item is in progress. Update when the plan or actual progress changes, keeping blocked or unverified work incomplete. Simple requests need no plan. An empty list clears it. Reports progress without executing work or granting permission.",
      execute: (input) => Promise.resolve(todoPlanSchema.parse(input)),
      inputSchema: todoPlanSchema,
      outputSchema: todoPlanSchema,
    }),
  };
}

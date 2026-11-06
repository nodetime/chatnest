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
        "Collect essential missing task inputs or a user decision before work that depends on them. Ask 1-3 concise questions together, using text for a target, link or material description, and single/multi-choice for meaningful options. Reuse what the user already supplied; do not ask a questionnaire for a clear single lookup. This pauses until the user answers or skips; do not run dependent queries while waiting or treat a skipped answer as supplied material. Do not use askUser for tool permission or a second confirmation: MCP/browser approvals are handled by the host.",
      inputSchema: askUserInputSchema,
      outputSchema: askUserOutputSchema,
      // 无 execute：客户端提供答案，服务端根据原始已存储问题再次校验。
    }),
    updateTodo: tool({
      description:
        "Track a substantive multi-step task with a short list of concrete deliverables. Publish the complete replacement list using stable item IDs and pending, in_progress or completed status, with one step in progress. Update only when the plan or actual status changes; skill loading, waiting for answers, a planned query and an unverified result do not complete the task. Keep blocked work incomplete and report its gap. Skip this tool for a single lookup or simple answer. An empty list clears the plan. This reports progress; it neither executes work nor grants permission.",
      execute: (input) => Promise.resolve(todoPlanSchema.parse(input)),
      inputSchema: todoPlanSchema,
      outputSchema: todoPlanSchema,
    }),
  };
}

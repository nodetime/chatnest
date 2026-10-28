import { z } from "zod";
import { compactToolApprovals } from "./approval-transport";
import type { ChatMessage } from "./types";

const identifier = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const optionSchema = z
  .object({ label: z.string().trim().min(1).max(120), value: identifier })
  .strict();
const questionSchema = z
  .object({
    id: identifier,
    label: z.string().trim().min(1).max(300),
    options: z.array(optionSchema).min(1).max(12).optional(),
    required: z.boolean(),
    type: z.enum(["text", "single", "multi"]),
  })
  .strict()
  .superRefine((question, context) => {
    if (question.type !== "text" && !question.options) {
      context.addIssue({ code: "custom", message: "选择题需要选项" });
    }
    if (question.type === "text" && question.options) {
      context.addIssue({ code: "custom", message: "文本题不接受选项" });
    }
    if (
      question.options &&
      new Set(question.options.map((item) => item.value)).size !==
        question.options.length
    ) {
      context.addIssue({ code: "custom", message: "选项值须唯一" });
    }
  });

export const askUserInputSchema = z
  .object({
    questions: z.array(questionSchema).min(1).max(8),
    title: z.string().trim().min(1).max(180),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.questions.map((question) => question.id)).size ===
      value.questions.length,
    "问题标识须唯一"
  );
export type AskUserInput = z.infer<typeof askUserInputSchema>;
export const askUserOutputSchema = z
  .object({
    answers: z.record(
      identifier,
      z.union([z.string().max(4000), z.array(identifier).max(12)])
    ),
    status: z.enum(["answered", "cancelled"]),
  })
  .strict();
export type AskUserOutput = z.infer<typeof askUserOutputSchema>;

export const todoPlanSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: identifier,
            status: z.enum(["pending", "in_progress", "completed"]),
            title: z.string().trim().min(1).max(180),
          })
          .strict()
      )
      .max(24),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.items.map((item) => item.id)).size === value.items.length,
    "任务标识须唯一"
  );
export type TodoPlan = z.infer<typeof todoPlanSchema>;
export type AskUserPart = Extract<
  ChatMessage["parts"][number],
  { type: "tool-askUser" }
>;

/** 同时供表单和服务端使用；所有约束取自已存储的问题，不信任客户端重传的 input。 */
export function validateAskUserOutput(
  inputValue: unknown,
  outputValue: unknown
): AskUserOutput {
  const input = askUserInputSchema.safeParse(inputValue);
  const output = askUserOutputSchema.safeParse(outputValue);
  const invalid = () => new Error("Invalid interaction response");
  if (!input.success || !output.success) {
    throw invalid();
  }
  if (output.data.status === "cancelled") {
    if (Object.keys(output.data.answers).length) {
      throw invalid();
    }
    return output.data;
  }
  const questionIds = new Set(
    input.data.questions.map((question) => question.id)
  );
  if (Object.keys(output.data.answers).some((key) => !questionIds.has(key))) {
    throw invalid();
  }
  const answers: AskUserOutput["answers"] = {};
  for (const question of input.data.questions) {
    const answer = output.data.answers[question.id];
    if (answer === undefined) {
      if (question.required) {
        throw invalid();
      }
      continue;
    }
    if (question.type === "multi") {
      if (
        !Array.isArray(answer) ||
        new Set(answer).size !== answer.length ||
        (question.required && !answer.length) ||
        answer.some(
          (value) => !question.options?.some((option) => option.value === value)
        )
      ) {
        throw invalid();
      }
      answers[question.id] =
        question.options
          ?.filter((option) => answer.includes(option.value))
          .map((option) => option.value) ?? [];
    } else {
      if (
        typeof answer !== "string" ||
        (question.required && !answer.trim()) ||
        (question.type === "single" &&
          answer !== "" &&
          !question.options?.some((option) => option.value === answer))
      ) {
        throw invalid();
      }
      answers[question.id] = question.type === "text" ? answer.trim() : answer;
    }
  }
  return { answers, status: "answered" };
}

/** 仅最新 assistant 的 askUser 允许客户端提供结果；MCP/Todo 的输出始终由服务端产生。 */
export function applyAskUserResponses(
  stored: ChatMessage[],
  responses: ChatMessage[]
) {
  const latest = stored.at(-1);
  let changed = false;
  let parts = latest?.parts ?? [];
  for (const response of responses) {
    for (const candidate of response.parts) {
      if (!("state" in candidate) || candidate.state !== "output-available") {
        continue;
      }
      if (
        candidate.type !== "tool-askUser" ||
        response.role !== "assistant" ||
        latest?.role !== "assistant" ||
        response.id !== latest.id
      ) {
        throw new Error("Invalid interaction response");
      }
      const index = parts.findIndex(
        (part) =>
          part.type === "tool-askUser" &&
          part.toolCallId === candidate.toolCallId
      );
      const current = parts[index];
      if (
        current?.type !== "tool-askUser" ||
        (current.state !== "input-available" &&
          current.state !== "output-available")
      ) {
        throw new Error("Invalid interaction response");
      }
      const output = validateAskUserOutput(current.input, candidate.output);
      if (current.state === "output-available") {
        if (!sameInteractionValue(current.output, output)) {
          throw new Error("Conflicting interaction response");
        }
        continue;
      }
      parts = parts.map((part, partIndex) =>
        partIndex === index
          ? { ...current, output, state: "output-available" }
          : part
      );
      changed = true;
    }
  }
  return {
    changed,
    messages: changed
      ? stored.map((message, index) =>
          index === stored.length - 1 ? { ...message, parts } : message
        )
      : stored,
  };
}

export function hasPendingInteraction(messages: ChatMessage[]) {
  const latest = messages.at(-1);
  return (
    latest?.role === "assistant" &&
    latest.parts.some(
      (part) =>
        ("state" in part && part.state === "approval-requested") ||
        (part.type === "tool-askUser" &&
          part.state === "input-available" &&
          askUserInputSchema.safeParse(part.input).success)
    )
  );
}

export function compactInteractionResponses(
  messages: { id: string; role: string; parts: unknown[] }[]
) {
  const latest = messages.at(-1);
  if (latest?.role !== "assistant") {
    return [];
  }
  const approvals = compactToolApprovals([latest])[0]?.parts ?? [];
  const answers = latest.parts.flatMap((value) => {
    const part = value as {
      type?: unknown;
      state?: unknown;
      toolCallId?: unknown;
      output?: unknown;
    };
    return part?.type === "tool-askUser" &&
      part.state === "output-available" &&
      typeof part.toolCallId === "string"
      ? [
          {
            output: part.output,
            state: "output-available",
            toolCallId: part.toolCallId,
            type: "tool-askUser",
          },
        ]
      : [];
  });
  return approvals.length || answers.length
    ? [
        {
          id: latest.id,
          parts: [...answers, ...approvals],
          role: "assistant" as const,
        },
      ]
    : [];
}

export function interactionResponseSignature(messages: ChatMessage[]) {
  return JSON.stringify(compactInteractionResponses(messages));
}

/** 不执行工具、不代替审批。仅判断本轮交互是否全部收齐，并拒绝已发送的同一批结果。 */
export function shouldContinueAgent(
  messages: ChatMessage[],
  paused: boolean,
  sentSignature: string
) {
  if (paused || interactionResponseSignature(messages) === sentSignature) {
    return false;
  }
  const latest = messages.at(-1);
  if (latest?.role !== "assistant") {
    return false;
  }
  const start = latest.parts.findLastIndex(
    (part) => part.type === "step-start"
  );
  const tools = latest.parts
    .slice(start + 1)
    .filter((part) => "toolCallId" in part);
  return (
    tools.some(
      (part) =>
        (part.type === "tool-askUser" && part.state === "output-available") ||
        ("state" in part && part.state === "approval-responded")
    ) &&
    tools.every(
      (part) =>
        "state" in part &&
        [
          "output-available",
          "output-error",
          "output-denied",
          "approval-responded",
        ].includes(part.state)
    )
  );
}

export function deriveTaskProgress(messages: ChatMessage[]): TodoPlan | null {
  let latest: TodoPlan | null = null;
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    for (const part of message.parts) {
      if (
        part.type !== "tool-updateTodo" ||
        part.state !== "output-available"
      ) {
        continue;
      }
      const parsed = todoPlanSchema.safeParse(part.output);
      if (parsed.success) {
        latest = parsed.data;
      }
    }
  }
  return latest;
}

/** PostgreSQL JSONB 不保留对象键顺序；持久化快照/答案按 JSON 语义比较。 */
export function sameInteractionValue(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(normalize);
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalize(item)])
      );
    }
    return value;
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

/** 将并发请求已保存的其它答案同步给当前客户端，不重放任何工具执行。 */
export function storedAskUserOutputs(messages: ChatMessage[]) {
  const latest = messages.at(-1);
  if (latest?.role !== "assistant") {
    return [];
  }
  return latest.parts.flatMap((part) =>
    part.type === "tool-askUser" && part.state === "output-available"
      ? [
          {
            output: part.output,
            toolCallId: part.toolCallId,
            type: "tool-output-available" as const,
          },
        ]
      : []
  );
}

/** 中断后只用属主服务端快照确认提交；本地 addToolOutput 不等于已保存。 */
export function hasSavedAskResponse(
  messages: ChatMessage[],
  messageId: string,
  toolCallId: string,
  output: AskUserOutput
) {
  const message = messages.find(
    (item) => item.id === messageId && item.role === "assistant"
  );
  return (
    message?.parts.some(
      (part) =>
        part.type === "tool-askUser" &&
        part.toolCallId === toolCallId &&
        part.state === "output-available" &&
        sameInteractionValue(part.output, output)
    ) ?? false
  );
}

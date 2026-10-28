import type { ChatMessage } from "@/server/domain/message/types";
import { MAX_MESSAGE_CHARACTERS } from "./input-limits";

export function prepareRegeneration(
  stored: ChatMessage[],
  incomingUserId: string
): { context: ChatMessage[]; answerId: string } | null {
  const answer = stored.at(-1);
  const question = stored.at(-2);
  if (
    answer?.role !== "assistant" ||
    question?.role !== "user" ||
    question.id !== incomingUserId ||
    answer.parts.some(
      (part) =>
        "state" in part &&
        [
          "approval-requested",
          "approval-responded",
          "input-streaming",
          "input-available",
        ].includes(String(part.state))
    )
  ) {
    return null;
  }
  return { answerId: answer.id, context: stored.slice(0, -1) };
}

export function prepareMessageEdit(
  stored: ChatMessage[],
  incomingUserId: string,
  text: string
): { context: ChatMessage[]; edited: ChatMessage; index: number } | null {
  const index = stored.findIndex(
    (item) => item.id === incomingUserId && item.role === "user"
  );
  if (index < 0 || !text.trim() || text.length > MAX_MESSAGE_CHARACTERS) {
    return null;
  }
  const original = stored[index];
  const edited: ChatMessage = {
    ...original,
    parts: [
      ...original.parts.filter((part) => part.type === "file"),
      { text, type: "text" },
    ],
  };
  return { context: [...stored.slice(0, index), edited], edited, index };
}

/** Model-only projection: abandoned calls remain in UI/audit history but carry no reusable approval. */
export function projectSettledToolHistory<
  T extends { id: string; role: string; parts: unknown[] },
>(messages: T[], resumingAssistantId?: string): T[] {
  return messages.map((message) =>
    message.role !== "assistant" || message.id === resumingAssistantId
      ? message
      : {
          ...message,
          parts: message.parts.filter((part) => {
            if (!part || typeof part !== "object" || !("type" in part)) {
              return true;
            }
            const { type } = part;
            if (
              typeof type !== "string" ||
              !(type === "dynamic-tool" || type.startsWith("tool-"))
            ) {
              return true;
            }
            return (
              !("state" in part) ||
              ![
                "input-streaming",
                "input-available",
                "approval-requested",
                "approval-responded",
              ].includes(String(part.state))
            );
          }),
        }
  );
}

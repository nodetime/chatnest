import type { ChatMessage } from "@/app/_lib/types";
import { MAX_MESSAGE_CHARACTERS } from "@/server/agent/input-limits";

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

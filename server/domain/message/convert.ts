import type { UIMessage, UIMessagePart } from "ai";
import { formatISO } from "date-fns";
import type { StoredMessage } from "./repository";
import type { ChatMessage, ChatTools, CustomUIDataTypes } from "./types";

// P2 从 app/_lib/utils.ts 迁入:纯转换函数,领域层与 UI 共用

export function convertToUIMessages(messages: StoredMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    metadata: {
      createdAt: formatISO(message.createdAt),
    },
    parts: message.parts as UIMessagePart<CustomUIDataTypes, ChatTools>[],
    role: message.role as "user" | "assistant" | "system",
  }));
}

export function getTextFromMessage(message: ChatMessage | UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("");
}

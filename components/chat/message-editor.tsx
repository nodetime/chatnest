"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Dispatch, SetStateAction } from "react";
import type { ChatMessage } from "@/lib/types";
export async function submitEditedMessage({
  message,
  text,
  snapshot,
  setMessages,
  regenerate,
  getSendError,
  isCurrent,
  setInput,
}: {
  message: ChatMessage;
  text: string;
  snapshot: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  getSendError: () => Error | undefined;
  isCurrent: () => boolean;
  setInput: Dispatch<SetStateAction<string>>;
}) {
  const index = snapshot.findIndex((item) => item.id === message.id);
  if (index < 0) {
    throw new Error("待编辑消息已失效。");
  }
  setMessages([
    ...snapshot.slice(0, index),
    {
      ...message,
      parts: [
        ...message.parts.filter((part) => part.type === "file"),
        { text, type: "text" },
      ],
    },
  ]);
  try {
    await regenerate({ body: { trigger: "edit-message" } });
    if (!isCurrent()) {
      return false;
    }
    const error = getSendError();
    if (error) {
      throw error;
    }
    setInput((current) => (current === text ? "" : current));
    return true;
  } catch (error) {
    if (isCurrent()) {
      setMessages(snapshot);
    }
    throw error;
  }
}

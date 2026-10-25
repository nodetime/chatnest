"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import type { VisibilityType } from "@/app/_components/chat/visibility-selector";
import { auth } from "@/app/(auth)/auth";
import {
  deleteMessagesByChatIdAfterTimestamp,
  getChatById,
  getMessageById,
  updateChatTitleById,
  updateChatVisibilityById,
} from "@/server/db/queries";

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-model", model);
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const [message] = await getMessageById({ id });
  if (!message) {
    throw new Error("Message not found");
  }

  const chat = await getChatById({ id: message.chatId });
  if (!chat || chat.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  z.object({
    chatId: z.uuid(),
    visibility: z.enum(["private", "public"]),
  }).parse({ chatId, visibility });
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const chat = await getChatById({ id: chatId });
  if (!chat || chat.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  if (!(await updateChatVisibilityById({ chatId, visibility }))) {
    throw new Error("可见范围未保存。");
  }
}

export async function renameChat(input: { chatId: string; title: string }) {
  const { chatId, title } = z
    .object({ chatId: z.uuid(), title: z.string().trim().min(1).max(120) })
    .parse(input);
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("请先登录。");
  }
  const chat = await getChatById({ id: chatId });
  if (!chat || chat.userId !== session.user.id) {
    throw new Error("无法重命名这段对话。");
  }
  if (!(await updateChatTitleById({ chatId, title }))) {
    throw new Error("标题未保存，请稍后重试。");
  }
  return { title };
}

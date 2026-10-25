import { deleteChat } from "@/server/application/chat/delete-chat";
import {
  type SendMessageInput,
  sendMessage,
} from "@/server/application/chat/send-message";
import { chatRepository } from "@/server/infrastructure/persistence/drizzle/chat-repository";
import { messageRepository } from "@/server/infrastructure/persistence/drizzle/message-repository";

// 模块级装配工厂:平台层(route/actions)只经此入口取用例,不触碰仓储实现(R3 的豁免点)
// 单进程内只装配一次;测试不走这里,直接以 mock 仓储调 sendMessage/deleteChat
function buildUseCases() {
  const chats = chatRepository;
  const messages = messageRepository;
  return {
    deleteChat: (input: { id: string; userId: string }) =>
      deleteChat(input, { chats }),
    // 断线续流登记(stream_ids):平台层 Response 组装阶段调用,不经用例
    registerResumeStream: (chatId: string, streamId: string) =>
      chats.createStreamId(chatId, streamId),
    sendMessage: (input: SendMessageInput) =>
      sendMessage(input, { chats, messages }),
  };
}

let cached: ReturnType<typeof buildUseCases> | undefined;

export function useCases() {
  return (cached ??= buildUseCases());
}

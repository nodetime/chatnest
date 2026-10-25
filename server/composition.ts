import { deleteChat } from "@/server/application/chat/delete-chat";
import {
  type SendMessageInput,
  sendMessage,
} from "@/server/application/chat/send-message";
import { chatRepository } from "@/server/infrastructure/persistence/drizzle/chat-repository";
import { documentRepository } from "@/server/infrastructure/persistence/drizzle/document-repository";
import { messageRepository } from "@/server/infrastructure/persistence/drizzle/message-repository";
import { suggestionRepository } from "@/server/infrastructure/persistence/drizzle/suggestion-repository";
import { userRepository } from "@/server/infrastructure/persistence/drizzle/user-repository";
import { voteRepository } from "@/server/infrastructure/persistence/drizzle/vote-repository";

// 模块级装配工厂:平台层(route/actions)只经此入口取用例与域门面,不触碰仓储实现(R3 的豁免点)。
// P3 域门面只暴露平台层实际需要的方法;chat 编排走 sendMessage 用例,写入侧 replace* 不外露。
// 单进程内只装配一次;测试不走这里,直接以 mock 仓储调 sendMessage/deleteChat。
// 命名避开 use 前缀:biome React 预设会把 use* 当 hook,嵌套调用即误报 useHookAtTopLevel
function buildUseCases() {
  const chats = chatRepository;
  const messages = messageRepository;
  return {
    // ---- P3 域门面(平台层只读/受控写)----
    chats: {
      deleteAllByUserId: chats.deleteAllByUserId.bind(chats),
      findById: chats.findById.bind(chats),
      listByUser: chats.listByUser.bind(chats),
      updateTitle: chats.updateTitle.bind(chats),
      updateVisibility: chats.updateVisibility.bind(chats),
    },
    deleteChat: (input: { id: string; userId: string }) =>
      deleteChat(input, { chats }),
    documents: {
      deleteAfterTimestamp:
        documentRepository.deleteAfterTimestamp.bind(documentRepository),
      listById: documentRepository.listById.bind(documentRepository),
      save: documentRepository.save.bind(documentRepository),
      saveResultTableView:
        documentRepository.saveResultTableView.bind(documentRepository),
      updateContent: documentRepository.updateContent.bind(documentRepository),
    },
    messages: {
      deleteByChatIdAfterTimestamp:
        messages.deleteByChatIdAfterTimestamp.bind(messages),
      findById: messages.findById.bind(messages),
      listByChatId: messages.listByChatId.bind(messages),
    },
    // 断线续流登记(stream_ids):平台层 Response 组装阶段调用,不经用例
    registerResumeStream: (chatId: string, streamId: string) =>
      chats.createStreamId(chatId, streamId),
    sendMessage: (input: SendMessageInput) =>
      sendMessage(input, { chats, messages }),
    suggestions: {
      listByDocumentId:
        suggestionRepository.listByDocumentId.bind(suggestionRepository),
    },
    users: {
      create: userRepository.create.bind(userRepository),
      createGuest: userRepository.createGuest.bind(userRepository),
      findByEmail: userRepository.findByEmail.bind(userRepository),
    },
    votes: {
      listByChatId: voteRepository.listByChatId.bind(voteRepository),
      upsert: voteRepository.upsert.bind(voteRepository),
    },
  };
}

let cached: ReturnType<typeof buildUseCases> | undefined;

export function getUseCases() {
  if (!cached) {
    cached = buildUseCases();
  }
  return cached;
}

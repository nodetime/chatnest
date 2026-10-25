import {
  getMessageCountByUserId,
  getMessagesByChatId,
  replaceEditedTurn,
  replaceRegeneratedAnswer,
  saveMessages,
  updateMessage,
} from "@/server/db/queries";
import type { MessageRepository } from "@/server/domain/message/repository";

// P2 仓储实现:委托 queries.ts 既有函数,行为零漂移;结构透传处集中一个断言转换
type QueriesEditedTurn = Parameters<typeof replaceEditedTurn>[0];
type QueriesRegenerated = Parameters<typeof replaceRegeneratedAnswer>[0];

export const messageRepository: MessageRepository = {
  countByUserSince(userId, differenceInHours) {
    return getMessageCountByUserId({ differenceInHours, id: userId });
  },
  listByChatId(chatId) {
    return getMessagesByChatId({ id: chatId });
  },
  replaceEditedTurn(input) {
    return replaceEditedTurn(input as unknown as QueriesEditedTurn);
  },
  replaceRegeneratedAnswer(input) {
    return replaceRegeneratedAnswer(input as unknown as QueriesRegenerated);
  },
  saveMany(messages) {
    return saveMessages({
      messages: messages as Parameters<typeof saveMessages>[0]["messages"],
    });
  },
  updateParts(id, parts) {
    return updateMessage({ id, parts: parts as never });
  },
};

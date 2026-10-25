import {
  createStreamId,
  deleteChatById,
  getChatById,
  updateChatTitleById,
} from "@/server/db/queries";
import type { ChatRepository } from "@/server/domain/chat/repository";

// P2 仓储实现:委托 queries.ts 既有函数,行为零漂移;P3 掏空 queries 时把 SQL 下沉到本目录
export const chatRepository: ChatRepository = {
  createStreamId(chatId, streamId) {
    return createStreamId({ chatId, streamId });
  },
  deleteById(id) {
    return deleteChatById({ id });
  },
  findById(id) {
    return getChatById({ id });
  },
  updateTitle(chatId, title) {
    return updateChatTitleById({ chatId, title });
  },
};

import type { Chat } from "./types";

// chat 仓储契约:面向领域声明,实现落 infrastructure/persistence/drizzle
export interface ChatRepository {
  // 断线续流登记(stream_ids 表)
  createStreamId: (chatId: string, streamId: string) => Promise<unknown>;
  // 级联清理消息/投票/流并删除会话本身,返回被删会话(仅供响应回显)
  deleteById: (id: string) => Promise<unknown>;
  // 会话不存在返回 null
  findById: (id: string) => Promise<Chat | null>;
  // 自动生成标题落库(幂等更新)
  updateTitle: (chatId: string, title: string) => Promise<unknown>;
}

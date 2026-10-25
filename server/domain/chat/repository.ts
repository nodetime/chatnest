import type { Chat } from "./types";

// chat 仓储契约:面向领域声明,实现落 infrastructure/persistence/drizzle
export interface ChatRepository {
  // 断线续流登记(stream_ids 表)
  createStreamId: (chatId: string, streamId: string) => Promise<void>;
  // 删除该用户全部会话(级联消息/投票/流 + 资产清理),返回删除数量
  deleteAllByUserId: (userId: string) => Promise<{ deletedCount: number }>;
  // 级联清理消息/投票/流并删除会话本身,返回被删会话(仅供响应回显)
  deleteById: (id: string) => Promise<unknown>;
  // 会话不存在返回 null
  findById: (id: string) => Promise<Chat | null>;
  // 游标分页 + 标题模糊搜索(游标会话不存在抛 not_found)
  listByUser: (input: {
    endingBefore: string | null;
    id: string;
    limit: number;
    search?: string;
    startingAfter: string | null;
  }) => Promise<{ chats: Chat[]; hasMore: boolean }>;
  save: (input: {
    id: string;
    title: string;
    userId: string;
    visibility: "public" | "private";
  }) => Promise<unknown>;
  // 尽力而为标题更新,失败返回 false(标题非关键路径)
  updateTitle: (chatId: string, title: string) => Promise<boolean>;
  updateVisibility: (
    chatId: string,
    visibility: "public" | "private"
  ) => Promise<boolean>;
}

import type { Vote } from "@/server/db/schema";

// vote 仓储契约:面向领域声明,实现落 infrastructure/persistence/drizzle
export interface VoteRepository {
  listByChatId: (chatId: string) => Promise<Vote[]>;
  // 点赞/点踩:同一消息仅一条记录,重复操作改写方向
  upsert: (input: {
    chatId: string;
    messageId: string;
    type: "up" | "down";
  }) => Promise<unknown>;
}

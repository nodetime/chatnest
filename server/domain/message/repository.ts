import type { ChatMessage } from "./types";

// messages 表行的领域视图:结构与 drizzle InferSelectModel 兼容,仓储实现处做结构透传
export type StoredMessage = {
  attachments: unknown;
  chatId: string;
  createdAt: Date;
  id: string;
  parts: unknown;
  role: string;
};

// message 仓储契约:面向领域声明,实现落 infrastructure/persistence/drizzle
export interface MessageRepository {
  // 用户近 N 小时消息量(配额判定用)
  countByUserSince: (
    userId: string,
    differenceInHours: number
  ) => Promise<number>;
  // 删除时间戳之后的消息(级联清对应投票)
  deleteByChatIdAfterTimestamp: (
    chatId: string,
    timestamp: Date
  ) => Promise<unknown>;
  // 单条消息(可能命中 0/1 行)
  findById: (id: string) => Promise<StoredMessage[]>;
  listByChatId: (chatId: string) => Promise<StoredMessage[]>;
  // 编辑整轮替换:以 snapshot 为并发基线,替换失败抛错回滚
  replaceEditedTurn: (input: {
    answer: StoredMessage;
    chatId: string;
    edited: ChatMessage;
    snapshot: StoredMessage[];
    userId: string;
  }) => Promise<unknown>;
  // 重新生成:删旧答案补新答案,以 snapshot 为并发基线
  replaceRegeneratedAnswer: (input: {
    answer: StoredMessage;
    chatId: string;
    snapshot: StoredMessage[];
    userId: string;
  }) => Promise<unknown>;
  saveMany: (messages: StoredMessage[]) => Promise<unknown>;
  updateParts: (id: string, parts: unknown) => Promise<unknown>;
}

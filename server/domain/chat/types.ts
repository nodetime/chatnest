// chat 聚合的领域类型与纯规则(P2 从路由处理器迁出)

export type ChatVisibility = "public" | "private";

export type Chat = {
  createdAt: Date;
  id: string;
  title: string;
  userId: string;
  visibility: ChatVisibility;
};

// 访问规则:会话存在且属主匹配;会话缺失同样判不可访问(与原路由 chat?.userId !== userId 判定等价)
export function canAccessChat(chat: Chat | null, userId: string): boolean {
  return chat !== null && chat.userId === userId;
}

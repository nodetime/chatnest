// vote 聚合领域类型:与 infrastructure/persistence/drizzle/schema.ts 的 votes 表结构等价,
// 仓储实现处的赋值由 tsc 校验,列变更会在此处报错(防漂移)。
export type Vote = {
  // 所属会话外键
  chatId: string;
  // 评价方向:true 点赞 / false 点踩
  isUpvoted: boolean;
  // 被评价消息外键
  messageId: string;
};

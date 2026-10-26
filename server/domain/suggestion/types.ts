// suggestion 聚合领域类型:与 infrastructure/persistence/drizzle/schema.ts 的 suggestions 表结构等价,
// 仓储实现处的赋值由 tsc 校验,列变更会在此处报错(防漂移)。
export type Suggestion = {
  // 建议生成时间
  createdAt: Date;
  // 建议说明:向用户解释本次改动的理由
  description: string | null;
  // 目标文档版本时间(复合外键之一,精确锚定文档版本)
  documentCreatedAt: Date;
  // 目标文档标识
  documentId: string;
  // 建议唯一标识
  id: string;
  // 建议是否已被处理(已采纳或已忽略)
  isResolved: boolean;
  // 建议针对的原文选区
  originalText: string;
  // 建议替换后的文本
  suggestedText: string;
  // 所属用户外键
  userId: string;
};

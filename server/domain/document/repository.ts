import type { ResultTable, ResultView } from "@/server/artifacts/result-table";
import type { Document } from "@/server/db/schema";
import type { ArtifactKind } from "@/server/domain/message/types";

// document 仓储契约:面向领域声明,实现落 infrastructure/persistence/drizzle。
// 版本化写入靠 pg_advisory_xact_lock + createdAt 单调递增;结果表受保护不可覆写。

export interface DocumentRepository {
  // 删除时间戳之后的全部版本(级联清 suggestion),受保护结果表拒绝
  deleteAfterTimestamp: (input: {
    id: string;
    timestamp: Date;
  }) => Promise<Document[]>;
  // 最新版本
  findLatestById: (id: string) => Promise<Document | undefined>;
  // 全版本(按创建时间升序)
  listById: (id: string) => Promise<Document[]>;
  save: (input: {
    id: string;
    title: string;
    kind: ArtifactKind;
    content: string;
    userId: string;
  }) => Promise<Document[]>;
  // 结果表文档落库:仅允许新建,已存在即 409,且必须挂属主会话
  saveResultTable: (input: {
    id: string;
    title: string;
    table: ResultTable;
    userId: string;
  }) => Promise<Document[]>;
  // 保存结果表视图:校验属主/会话/期望版本(expectedVersion=ISO 时间戳)
  saveResultTableView: (input: {
    id: string;
    chatId: string;
    userId: string;
    expectedVersion: string;
    view: ResultView;
    notes: string;
  }) => Promise<Document[]>;
  // 只更新最新版本;版本已变更时更新零行(乐观并发)
  updateContent: (input: {
    id: string;
    content: string;
  }) => Promise<Document[]>;
}

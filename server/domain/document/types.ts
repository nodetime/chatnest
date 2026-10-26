// document 聚合领域类型:与 infrastructure/persistence/drizzle/schema.ts 的 documents 表结构等价,
// 仓储实现处的赋值由 tsc 校验,列变更会在此处报错(防漂移)。
// 产物的前端视图状态(P5 自 app/_components/chat/artifact.tsx 迁入,server 侧 stream-state 与 UI 共用)
export type UIArtifact = {
  title: string;
  documentId: string;
  kind: "text" | "code" | "image" | "sheet";
  content: string;
  isVisible: boolean;
  status: "streaming" | "idle";
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
};

export type Document = {
  // 文档正文内容
  content: string | null;
  // 本版本创建时间;同一文档每次保存生成新版本行(联合主键之一)
  createdAt: Date;
  // 文档标识:多版本共用
  id: string;
  // 文档类型(text/code/image/sheet;DB 列名沿用历史名 text)
  kind: "text" | "code" | "image" | "sheet";
  // 文档标题
  title: string;
  // 所属用户外键
  userId: string;
};

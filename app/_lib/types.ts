// P2 起聊天域核心类型迁至 server/domain/message/types.ts;此处保留转发,UI 引用点零改动(R4 方向:UI 只 import domain)
export type {
  ChatMessage,
  ChatTools,
  CustomUIDataTypes,
  MessageMetadata,
  WaitingStatusData,
} from "@/server/domain/message/types";
export { messageMetadataSchema } from "@/server/domain/message/types";

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
  size?: number;
  extraction?: {
    status: import("@/server/domain/attachment/document-types").DocumentExtraction["status"];
    characters: number;
    segments: number;
    warnings: string[];
  };
  error?: string;
  retryFile?: File;
};

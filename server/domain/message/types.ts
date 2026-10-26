import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
// biome-ignore lint/style/noRestrictedImports: 已登记豁免:ChatTools 依赖工具定义的 InferUITool 推导,翻转需重写工具类型声明(裁决见 P5 待办)
import type { McpSourceMetadata } from "@/server/agent/result-evidence";
// biome-ignore lint/style/noRestrictedImports: 已登记豁免:ChatTools 依赖工具定义的 InferUITool 推导,翻转需重写工具类型声明(裁决见 P5 待办)
import type { createDocument } from "@/server/ai/tools/create-document";
// biome-ignore lint/style/noRestrictedImports: 已登记豁免:ChatTools 依赖工具定义的 InferUITool 推导,翻转需重写工具类型声明(裁决见 P5 待办)
import type { createResultTable } from "@/server/ai/tools/create-result-table";
// biome-ignore lint/style/noRestrictedImports: 已登记豁免:ChatTools 依赖工具定义的 InferUITool 推导,翻转需重写工具类型声明(裁决见 P5 待办)
import type { getWeather } from "@/server/ai/tools/get-weather";
// biome-ignore lint/style/noRestrictedImports: 已登记豁免:ChatTools 依赖工具定义的 InferUITool 推导,翻转需重写工具类型声明(裁决见 P5 待办)
import type { requestSuggestions } from "@/server/ai/tools/request-suggestions";
// biome-ignore lint/style/noRestrictedImports: 已登记豁免:ChatTools 依赖工具定义的 InferUITool 推导,翻转需重写工具类型声明(裁决见 P5 待办)
import type { updateDocument } from "@/server/ai/tools/update-document";
import type { Suggestion } from "@/server/domain/suggestion/types";

// P2 从 app/_lib/types.ts 迁入:ChatMessage 是聊天域核心类型,应用层与 UI 共用(R4 允许 UI import domain 类型)

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

// 产物种类字面量:须与 app/_artifacts/{text,code,image,sheet}/client.tsx 的 kind 保持一致
export type ArtifactKind = "text" | "code" | "image" | "sheet";

type weatherTool = InferUITool<typeof getWeather>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;

export type ChatTools = {
  createResultTable: InferUITool<ReturnType<typeof createResultTable>>;
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
};

export type WaitingStatusData = {
  phase: "waiting" | "still-waiting" | "health" | "thinking";
  message: string;
  modelId: string;
  modelName: string;
};

export type CustomUIDataTypes = {
  "run-status": { state: "failed" | "resumed" };
  "mcp-source": McpSourceMetadata;
  resultTable: {
    id: string;
    title: string;
    kind: "sheet";
    content: string;
    version: string;
    chatId: string;
  };
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  "chat-title": string;
  "waiting-status": WaitingStatusData;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/app/_components/chat/artifact";
import type { McpSourceMetadata } from "@/lib/agent/result-evidence";
import type { createDocument } from "@/lib/ai/tools/create-document";
import type { createResultTable } from "@/lib/ai/tools/create-result-table";
import type { getWeather } from "@/lib/ai/tools/get-weather";
import type { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import type { updateDocument } from "@/lib/ai/tools/update-document";
import type { Suggestion } from "@/lib/db/schema";

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

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

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
  size?: number;
  extraction?: {
    status: import("@/lib/uploads/document-types").DocumentExtraction["status"];
    characters: number;
    segments: number;
    warnings: string[];
  };
  error?: string;
  retryFile?: File;
};

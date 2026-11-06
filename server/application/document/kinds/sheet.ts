import { streamText } from "ai";
import { updateDocumentPrompt } from "@/server/application/ai/prompts";
import { getLanguageModel } from "@/server/application/ai/providers";
import { metadataOnlyTelemetry } from "@/server/shared/telemetry";
import { createDocumentHandler } from "../artifact-service";

export const sheetDocumentHandler = createDocumentHandler<"sheet">({
  kind: "sheet",
  onUpdateDocument: async ({ document, description, dataStream, modelId }) => {
    let draftContent = "";

    const result = streamText({
      instructions: `${updateDocumentPrompt(document.content, "sheet")}\n\nOutput ONLY the raw CSV data. No explanations, no markdown fences.`,
      model: getLanguageModel(modelId),
      prompt: description,
      telemetry: metadataOnlyTelemetry,
    });

    for await (const delta of result.stream) {
      if (delta.type === "error") {
        throw new Error("表格修改未完成，请保留已保存版本。");
      }
      if (delta.type === "text-delta") {
        draftContent += delta.text;
      }
    }

    if ((await result.finishReason) !== "stop" || !draftContent.trim()) {
      throw new Error("表格修改未完整生成，请保留已保存版本。");
    }

    dataStream.write({
      data: draftContent,
      transient: true,
      type: "data-sheetDelta",
    });

    return draftContent;
  },
});

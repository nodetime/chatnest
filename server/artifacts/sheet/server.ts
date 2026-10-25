import { streamText } from "ai";
import { sheetPrompt, updateDocumentPrompt } from "@/server/ai/prompts";
import { getLanguageModel } from "@/server/ai/providers";
import { metadataOnlyTelemetry } from "@/server/ai/telemetry";
import { createDocumentHandler } from "@/server/artifacts/server";

export const sheetDocumentHandler = createDocumentHandler<"sheet">({
  kind: "sheet",
  onCreateDocument: async ({ title, dataStream, modelId }) => {
    let draftContent = "";

    const { stream } = streamText({
      instructions: `${sheetPrompt}\n\nOutput ONLY the raw CSV data. No explanations, no markdown fences.`,
      model: getLanguageModel(modelId),
      prompt: title,
      telemetry: metadataOnlyTelemetry,
    });

    for await (const delta of stream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          data: draftContent,
          transient: true,
          type: "data-sheetDelta",
        });
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream, modelId }) => {
    let draftContent = "";

    const { stream } = streamText({
      instructions: `${updateDocumentPrompt(document.content, "sheet")}\n\nOutput ONLY the raw CSV data. No explanations, no markdown fences.`,
      model: getLanguageModel(modelId),
      prompt: description,
      telemetry: metadataOnlyTelemetry,
    });

    for await (const delta of stream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          data: draftContent,
          transient: true,
          type: "data-sheetDelta",
        });
      }
    }

    return draftContent;
  },
});

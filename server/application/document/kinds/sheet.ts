import { streamText } from "ai";
import { updateDocumentPrompt } from "@/server/application/ai/prompts";
import { getLanguageModel } from "@/server/application/ai/providers";
import { metadataOnlyTelemetry } from "@/server/shared/telemetry";
import { createDocumentHandler } from "../artifact-service";

export const sheetDocumentHandler = createDocumentHandler<"sheet">({
  kind: "sheet",
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

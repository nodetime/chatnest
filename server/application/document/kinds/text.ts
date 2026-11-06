import { smoothStream, streamText } from "ai";
import { updateDocumentPrompt } from "@/server/application/ai/prompts";
import { getLanguageModel } from "@/server/application/ai/providers";
import { metadataOnlyTelemetry } from "@/server/shared/telemetry";
import { createDocumentHandler } from "../artifact-service";

export const textDocumentHandler = createDocumentHandler<"text">({
  kind: "text",
  onUpdateDocument: async ({ document, description, dataStream, modelId }) => {
    let draftContent = "";

    const { stream } = streamText({
      experimental_transform: smoothStream({ chunking: "word" }),
      instructions: updateDocumentPrompt(document.content, "text"),
      model: getLanguageModel(modelId),
      prompt: description,
      telemetry: metadataOnlyTelemetry,
    });

    for await (const delta of stream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          data: delta.text,
          transient: true,
          type: "data-textDelta",
        });
      }
    }

    return draftContent;
  },
});

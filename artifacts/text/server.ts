import { smoothStream, streamText } from "ai";
import { updateDocumentPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { metadataOnlyTelemetry } from "@/lib/ai/telemetry";
import { createDocumentHandler } from "@/lib/artifacts/server";

export const textDocumentHandler = createDocumentHandler<"text">({
  kind: "text",
  onCreateDocument: async ({ title, dataStream, modelId }) => {
    let draftContent = "";

    const { stream } = streamText({
      experimental_transform: smoothStream({ chunking: "word" }),
      instructions:
        "Write about the given topic. Markdown is supported. Use headings wherever appropriate.",
      model: getLanguageModel(modelId),
      prompt: title,
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

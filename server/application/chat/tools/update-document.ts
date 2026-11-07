import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { documentHandlersByArtifactKind } from "@/server/application/document/artifact-service";
import { isProtectedResultTable } from "@/server/domain/document/result-table";
import type { ChatMessage } from "@/server/domain/message/types";
import { documentRepository } from "@/server/infrastructure/persistence/drizzle/document-repository";

type UpdateDocumentProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  modelId: string;
};

export const updateDocument = ({
  session,
  dataStream,
  modelId,
}: UpdateDocumentProps) =>
  tool({
    description:
      "Revise an existing artifact as a whole using its latest saved content. Use for changes spanning many sections, rows or columns, such as shortening a whole table. Describe exactly what to change and what to preserve. Returns previousContent and savedContent for checking the actual changes. For a small exact replacement, use editDocument.",
    execute: async ({ id, description }) => {
      const document = await documentRepository.findLatestById(id);

      if (!document) {
        return {
          error: "Document not found",
        };
      }

      if (document.userId !== session.user?.id) {
        return { error: "Forbidden" };
      }

      if (isProtectedResultTable(document.content)) {
        return {
          error:
            "Result table source values are immutable. Only the explicit view/notes API may save a new view.",
        };
      }

      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === document.kind
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for kind: ${document.kind}`);
      }

      let content = "";
      await documentHandler.onUpdateDocument({
        dataStream: {
          ...dataStream,
          write: (part) => {
            if (part.type === "data-textDelta") {
              content += part.data;
            } else if (
              part.type === "data-codeDelta" ||
              part.type === "data-sheetDelta"
            ) {
              content = part.data;
            }
          },
        },
        description,
        document,
        modelId,
        session,
      });

      // Keep the saved version visible on failure, and target the actual
      // document even when its workspace was closed or showing another file.
      dataStream.write({ data: document.id, transient: true, type: "data-id" });
      dataStream.write({
        data: document.kind,
        transient: true,
        type: "data-kind",
      });
      dataStream.write({
        data: document.title,
        transient: true,
        type: "data-title",
      });
      dataStream.write({ data: null, transient: true, type: "data-clear" });
      dataStream.write({
        data: content,
        transient: true,
        type:
          document.kind === "code"
            ? "data-codeDelta"
            : document.kind === "sheet"
              ? "data-sheetDelta"
              : "data-textDelta",
      });
      dataStream.write({ data: null, transient: true, type: "data-finish" });

      return {
        content:
          document.kind === "code"
            ? "The script has been updated successfully."
            : "The document has been updated successfully.",
        id,
        kind: document.kind,
        previousContent: document.content,
        savedContent: content,
        title: document.title,
      };
    },
    inputSchema: z.object({
      description: z
        .string()
        .default("Improve the content")
        .describe("The description of changes that need to be made"),
      id: z.string().describe("The ID of the artifact to rewrite"),
    }),
  });

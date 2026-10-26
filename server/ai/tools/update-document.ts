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
      "Full rewrite of an existing artifact. Only use for major changes where most content needs replacing. Prefer editDocument for targeted changes.",
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

      dataStream.write({
        data: null,
        transient: true,
        type: "data-clear",
      });

      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === document.kind
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for kind: ${document.kind}`);
      }

      await documentHandler.onUpdateDocument({
        dataStream,
        description,
        document,
        modelId,
        session,
      });

      dataStream.write({ data: null, transient: true, type: "data-finish" });

      return {
        content:
          document.kind === "code"
            ? "The script has been updated successfully."
            : "The document has been updated successfully.",
        id,
        kind: document.kind,
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

import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { artifactKinds } from "@/server/application/document/artifact-service";
import { generateUUID } from "@/server/domain/message/ids";
import type { ChatMessage } from "@/server/domain/message/types";
import { documentRepository } from "@/server/infrastructure/persistence/drizzle/document-repository";

type CreateDocumentProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

export const createDocument = ({ session, dataStream }: CreateDocumentProps) =>
  tool({
    description:
      "Save the complete content you have composed as an editable artifact in the user's workspace. Use text for Markdown documents, code for source code and sheet for raw CSV. Include the actual content and relevant source links in this call; it is saved exactly as supplied, without another model generating it from the title. After successful creation, summarize the result briefly in chat and let the artifact hold the full deliverable. Follow the user's preferred output format.",
    execute: async ({ title, kind, content }) => {
      if (!session.user?.id) {
        return { error: "Sign in required" };
      }
      const id = generateUUID();
      await documentRepository.save({
        content,
        id,
        kind,
        title,
        userId: session.user.id,
      });

      // Publish only after persistence succeeds; a failed save must not open a
      // phantom document or leave the workspace permanently generating.
      dataStream.write({ data: id, transient: true, type: "data-id" });
      dataStream.write({ data: kind, transient: true, type: "data-kind" });
      dataStream.write({ data: title, transient: true, type: "data-title" });
      dataStream.write({ data: null, transient: true, type: "data-clear" });
      if (kind === "code") {
        dataStream.write({
          data: content,
          transient: true,
          type: "data-codeDelta",
        });
      } else if (kind === "sheet") {
        dataStream.write({
          data: content,
          transient: true,
          type: "data-sheetDelta",
        });
      } else {
        dataStream.write({
          data: content,
          transient: true,
          type: "data-textDelta",
        });
      }
      dataStream.write({ data: null, transient: true, type: "data-finish" });
      return {
        content: "Saved and opened in the workspace.",
        id,
        kind,
        savedContent: content,
        title,
      };
    },
    inputSchema: z.object({
      content: z
        .string()
        .min(1)
        .max(100_000)
        .refine((value) => value.trim().length > 0, "Content must not be blank")
        .describe(
          "Complete artifact body: Markdown for text, source code for code, raw CSV for sheet."
        ),
      kind: z.enum(artifactKinds),
      title: z.string().trim().min(1).max(200),
    }),
  });

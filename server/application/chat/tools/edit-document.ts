import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { isProtectedResultTable } from "@/server/domain/document/result-table";
import { sheetCsvMatches } from "@/server/domain/document/sheet-csv";
import type { ChatMessage } from "@/server/domain/message/types";
import { documentRepository } from "@/server/infrastructure/persistence/drizzle/document-repository";

type EditDocumentProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

export const editDocument = ({ session, dataStream }: EditDocumentProps) =>
  tool({
    description:
      "Edit an existing artifact. For a sheet, old_string must contain the complete saved table with identical cell values (CSV quoting may differ), and new_string the complete updated CSV; submit all changes together as one snapshot. Text and code use exact substring replacement. Results include savedContent for verification or correcting a stale match. Use updateDocument when you need a rewrite based on the latest saved body.",
    execute: async ({ id, old_string, new_string, replace_all }) => {
      const document = await documentRepository.findLatestById(id);

      if (!document) {
        return { error: "Document not found" };
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

      if (!document.content) {
        return { error: "Document has no content" };
      }

      const matches =
        document.kind === "sheet"
          ? sheetCsvMatches(old_string, document.content)
          : document.content.includes(old_string);
      if (!matches) {
        return {
          error: "old_string not found in document",
          savedContent: document.content,
        };
      }

      const updated =
        document.kind === "sheet"
          ? new_string
          : replace_all
            ? document.content.replaceAll(old_string, () => new_string)
            : document.content.replace(old_string, () => new_string);

      if (updated === document.content) {
        return {
          content: "No changes needed; the saved content already matches.",
          id,
          kind: document.kind,
          savedContent: document.content,
          title: document.title,
        };
      }

      await documentRepository.save({
        content: updated,
        id: document.id,
        kind: document.kind,
        title: document.title,
        userId: document.userId,
      });

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
      dataStream.write({
        data: null,
        transient: true,
        type: "data-clear",
      });

      if (document.kind === "code") {
        dataStream.write({
          data: updated,
          transient: true,
          type: "data-codeDelta",
        });
      } else if (document.kind === "sheet") {
        dataStream.write({
          data: updated,
          transient: true,
          type: "data-sheetDelta",
        });
      } else {
        dataStream.write({
          data: updated,
          transient: true,
          type: "data-textDelta",
        });
      }

      dataStream.write({ data: null, transient: true, type: "data-finish" });

      return {
        content:
          document.kind === "code"
            ? "The script has been edited successfully."
            : "The document has been edited successfully.",
        id,
        kind: document.kind,
        savedContent: updated,
        title: document.title,
      };
    },
    inputSchema: z.object({
      id: z.string().describe("The ID of the artifact to edit"),
      new_string: z.string().describe("Replacement string"),
      old_string: z
        .string()
        .describe(
          "For sheets, the complete saved CSV. For text/code, an exact substring with enough surrounding context for uniqueness."
        ),
      replace_all: z
        .boolean()
        .optional()
        .describe(
          "Replace all occurrences instead of just the first (default false)"
        ),
    }),
  });

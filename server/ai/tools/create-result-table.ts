import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import type { ChatMessage } from "@/app/_lib/types";
import { generateUUID } from "@/app/_lib/utils";
import type { ResultEvidenceLedger } from "@/server/agent/result-evidence";
import {
  buildResultTable,
  createResultTableSchema,
  type ResultTable,
} from "@/server/artifacts/result-table";
import { documentRepository } from "@/server/infrastructure/persistence/drizzle/document-repository";

export function createResultTable({
  ledger,
  chatId,
  session,
  dataStream,
}: {
  ledger: ResultEvidenceLedger;
  chatId: string;
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}) {
  return tool({
    description:
      "Optionally create a read-only result table from a recent successful MCP JSON tool output. Use the literal sourceToolCallId and rowsPath from that tool's bounded preview. Columns select original JSON Pointer fields; never supply row values or invent evidence. Tool returned does not mean independently verified. This is optional: answer normally when no table is useful.",
    execute: async (input) => {
      if (!session.user?.id) {
        return { error: "Sign in required" };
      }
      let table: ResultTable;
      try {
        table = buildResultTable(ledger, input, chatId);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Invalid source",
        };
      }
      const id = generateUUID();
      const [document] = await documentRepository.saveResultTable({
        id,
        table,
        title: input.title,
        userId: session.user.id,
      });
      const data = {
        chatId,
        content: document.content ?? "",
        id,
        kind: "sheet" as const,
        title: input.title,
        version: document.createdAt.toISOString(),
      };
      // One persisted event: kind, identity, content and readiness must change atomically.
      dataStream.write({ data, type: "data-resultTable" });
      return {
        chatId,
        content:
          "Original MCP rows copied without model rewriting. Tool returned · not independently verified.",
        id,
        kind: "sheet" as const,
        rowCount: table.rows.length,
        sourceToolCallId: table.source.toolCallId,
        title: input.title,
        version: data.version,
      };
    },
    inputSchema: createResultTableSchema,
  });
}

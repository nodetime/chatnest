import { createHash } from "node:crypto";
import type { UIMessageStreamWriter } from "ai";
import { BashWorkspace } from "@/server/application/chat/workspace";
import { createWorkspaceTools } from "@/server/application/chat/workspace-tools";
import type { ResultEvidenceLedger } from "@/server/domain/message/result-evidence";
import type { ChatMessage } from "@/server/domain/message/types";
import {
  executeBash,
  releaseBash,
} from "@/server/infrastructure/execution/bash";
import { documentRepository } from "@/server/infrastructure/persistence/drizzle/document-repository";

/** Vercel owns the tool definitions; this adapter connects execution and saved files. */
export function bashTools({
  userId,
  chatId,
  messages,
  ledger,
  dataStream,
}: {
  userId: string;
  chatId: string;
  messages: ChatMessage[];
  ledger: ResultEvidenceLedger;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}) {
  const sessionId = createHash("sha256")
    .update(JSON.stringify([userId, chatId]))
    .digest("hex");
  const workspace = new BashWorkspace({
    execute: (input, abortSignal) =>
      executeBash({ ...input, sessionId }, abortSignal),
    messages,
    publish: (document) => {
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
        data: document.content ?? "",
        transient: true,
        type:
          document.kind === "sheet"
            ? "data-sheetDelta"
            : document.kind === "code"
              ? "data-codeDelta"
              : "data-textDelta",
      });
      dataStream.write({ data: null, transient: true, type: "data-finish" });
    },
    release: (leaseId) => releaseBash({ leaseId, sessionId }),
    repository: documentRepository,
    sources: () => ledger.files(),
    userId,
  });
  return {
    persistSources: (files: Record<string, string>, callSignal: AbortSignal) =>
      workspace.syncSources(files, callSignal),
    tools: (runSignal: AbortSignal) =>
      createWorkspaceTools(workspace, runSignal),
  };
}

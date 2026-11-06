import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import type { Document } from "@/server/domain/document/types";
import type { ArtifactKind, ChatMessage } from "@/server/domain/message/types";
import { documentRepository } from "@/server/infrastructure/persistence/drizzle/document-repository";
import { codeDocumentHandler } from "./kinds/code";
import { sheetDocumentHandler } from "./kinds/sheet";
import { textDocumentHandler } from "./kinds/text";

export type SaveDocumentProps = {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
};

export type UpdateDocumentCallbackProps = {
  document: Document;
  description: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  session: Session;
  modelId: string;
};

export type DocumentHandler<T = ArtifactKind> = {
  kind: T;
  onUpdateDocument: (args: UpdateDocumentCallbackProps) => Promise<void>;
};

export function createDocumentHandler<T extends ArtifactKind>(config: {
  kind: T;
  onUpdateDocument: (params: UpdateDocumentCallbackProps) => Promise<string>;
}): DocumentHandler<T> {
  return {
    kind: config.kind,
    onUpdateDocument: async (args: UpdateDocumentCallbackProps) => {
      const draftContent = await config.onUpdateDocument({
        dataStream: args.dataStream,
        description: args.description,
        document: args.document,
        modelId: args.modelId,
        session: args.session,
      });

      if (args.session?.user?.id) {
        await documentRepository.save({
          content: draftContent,
          id: args.document.id,
          kind: config.kind,
          title: args.document.title,
          userId: args.session.user.id,
        });
      }
    },
  };
}

export const documentHandlersByArtifactKind: DocumentHandler[] = [
  textDocumentHandler,
  codeDocumentHandler,
  sheetDocumentHandler,
];

export const artifactKinds = ["text", "code", "sheet"] as const;

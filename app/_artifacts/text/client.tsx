import { toast } from "sonner";
import { Artifact } from "@/app/_components/chat/create-artifact";
import { DiffView } from "@/app/_components/chat/diffview";
import { DocumentSkeleton } from "@/app/_components/chat/document-skeleton";
import {
  ClockRewind,
  CopyIcon,
  MessageIcon,
  PenIcon,
  RedoIcon,
  UndoIcon,
} from "@/app/_components/chat/icons";
import { Editor } from "@/app/_components/chat/text-editor";
import type { Suggestion } from "@/server/domain/suggestion/types";
import { getSuggestions } from "../actions";

type TextArtifactMetadata = {
  suggestions: Suggestion[];
};

export const textArtifact = new Artifact<"text", TextArtifactMetadata>({
  actions: [
    {
      description: "查看更改",
      icon: <ClockRewind size={18} />,
      id: "view-changes",
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("toggle");
      },
    },
    {
      description: "上一版本",
      icon: <UndoIcon size={18} />,
      id: "previous-version",
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("prev");
      },
    },
    {
      description: "下一版本",
      icon: <RedoIcon size={18} />,
      id: "next-version",
      isDisabled: ({ isCurrentVersion }) => {
        if (isCurrentVersion) {
          return true;
        }

        return false;
      },
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("next");
      },
    },
    {
      description: "复制文本",
      icon: <CopyIcon size={18} />,
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success("已复制到剪贴板");
      },
    },
  ],
  content: ({
    documentId,
    mode,
    status,
    content,
    isCurrentVersion,
    isReadonly,
    currentVersionIndex,
    onSaveContent,
    getDocumentContentById,
    isLoading,
    metadata,
  }) => {
    if (isLoading) {
      return <DocumentSkeleton artifactKind="text" />;
    }

    if (mode === "diff") {
      const selectedContent = getDocumentContentById(currentVersionIndex);
      const prevContent =
        currentVersionIndex > 0
          ? getDocumentContentById(currentVersionIndex - 1)
          : selectedContent;

      return (
        <div className="mx-auto flex w-full max-w-[840px] flex-row px-6 py-9 md:px-10 md:py-11 [&_.ProseMirror]:min-h-[50vh] [&_.prose]:text-[14px] [&_.prose]:leading-[1.9] [&_h1]:text-[24px] [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h3]:text-[16px] [&_p]:leading-[1.9] [&_table]:text-[13px] [&_th]:bg-muted/60 [&_th]:font-medium [&_td]:border-border/60 [&_th]:border-border/60">
          <DiffView newContent={selectedContent} oldContent={prevContent} />
        </div>
      );
    }

    return (
      <div className="mx-auto flex w-full max-w-[840px] flex-row px-6 py-9 md:px-10 md:py-11 [&_.ProseMirror]:min-h-[50vh] [&_.prose]:text-[14px] [&_.prose]:leading-[1.9] [&_h1]:text-[24px] [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h3]:text-[16px] [&_p]:leading-[1.9] [&_table]:text-[13px] [&_th]:bg-muted/60 [&_th]:font-medium [&_td]:border-border/60 [&_th]:border-border/60">
        <Editor
          content={content}
          currentVersionIndex={currentVersionIndex}
          isCurrentVersion={isCurrentVersion && !isReadonly}
          key={`${documentId ?? "init"}:${currentVersionIndex}`}
          onSaveContent={onSaveContent}
          status={status}
          suggestions={isCurrentVersion && metadata ? metadata.suggestions : []}
        />

        {metadata?.suggestions && metadata.suggestions.length > 0 ? (
          <div className="h-dvh w-12 shrink-0 md:hidden" />
        ) : null}
      </div>
    );
  },
  description: "撰写与编辑文本，例如文章和邮件。",
  initialize: async ({ documentId, setMetadata }) => {
    const suggestions = await getSuggestions({ documentId });

    setMetadata((metadata) => ({
      ...metadata,
      suggestions,
    }));
  },
  kind: "text",
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    if (streamPart.type === "data-suggestion") {
      setMetadata((metadata) => ({
        ...metadata,
        suggestions: [...(metadata?.suggestions ?? []), streamPart.data],
      }));
    }

    if (streamPart.type === "data-textDelta") {
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: draftArtifact.content + streamPart.data,
        isVisible:
          draftArtifact.status === "streaming" &&
          draftArtifact.content.length > 400 &&
          draftArtifact.content.length < 450
            ? true
            : draftArtifact.isVisible,
        status: "streaming",
      }));
    }
  },
  toolbar: [
    {
      description: "润色文本",
      icon: <PenIcon />,
      onClick: ({ sendMessage }) => {
        sendMessage({
          parts: [
            {
              text: "Please add final polish and check for grammar, add section titles for better structure, and ensure everything reads smoothly.",
              type: "text",
            },
          ],
          role: "user",
        });
      },
    },
    {
      description: "请求修改建议",
      icon: <MessageIcon />,
      onClick: ({ sendMessage }) => {
        sendMessage({
          parts: [
            {
              text: "Please add suggestions you have that could improve the writing.",
              type: "text",
            },
          ],
          role: "user",
        });
      },
    },
  ],
});

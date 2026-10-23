"use client";

import equal from "fast-deep-equal";
import {
  type MouseEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import useSWR from "swr";
import { useActiveChat } from "@/hooks/use-active-chat";
import { useArtifact } from "@/hooks/use-artifact";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  isProtectedResultTable,
  parseResultTable,
} from "@/lib/artifacts/result-table";
import { openArtifactPreview } from "@/lib/artifacts/stream-state";
import type { Document } from "@/lib/db/schema";
import { cn, fetcher } from "@/lib/utils";
import type { ArtifactKind, UIArtifact } from "./artifact";
import { ArtifactTypeLabel } from "./artifact-type-label";
import { documentPreviewLayout } from "./document-preview-layout";
import {
  CodeIcon,
  FileIcon,
  FullscreenIcon,
  ImageIcon,
  LoaderIcon,
} from "./icons";
import { ImageEditor } from "./image-editor";
import { ResultTableView } from "./result-table";
import { SpreadsheetEditor } from "./sheet-editor";
import { Editor } from "./text-editor";

type DocumentToolOutput = {
  id: string;
  title: string;
  kind: ArtifactKind;
  content?: string;
};

type DocumentPreviewProps = {
  isReadonly: boolean;
  result?: Partial<DocumentToolOutput>;
  args?: Partial<DocumentToolOutput> & { isUpdate?: boolean };
};

export function DocumentPreview({
  isReadonly: _isReadonly,
  result,
  args,
}: DocumentPreviewProps) {
  const { artifact, setArtifact } = useArtifact();
  const { chatId } = useActiveChat();
  const workspace = useWorkspace();

  const { data: documents, isLoading: isDocumentsFetching } = useSWR<
    Document[]
  >(
    result
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/document?id=${result.id}&chatId=${chatId}`
      : null,
    fetcher
  );

  const previewDocument = useMemo(() => documents?.at(-1), [documents]);
  const hitboxRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const boundingBox = hitboxRef.current?.getBoundingClientRect();

    if (artifact.documentId && boundingBox) {
      setArtifact((currentArtifact) => ({
        ...currentArtifact,
        boundingBox: {
          height: boundingBox.height,
          left: boundingBox.x,
          top: boundingBox.y,
          width: boundingBox.width,
        },
      }));
    }
  }, [artifact.documentId, setArtifact]);

  if (isDocumentsFetching) {
    return (
      <div
        aria-busy="true"
        className="w-full max-w-[450px] overflow-hidden rounded-lg border border-border/70 bg-card"
      >
        <DocumentHeader
          isOpen={false}
          isStreaming={true}
          kind={result?.kind ?? args?.kind ?? artifact.kind}
          title={result?.title ?? args?.title ?? "正在加载产物…"}
        />
      </div>
    );
  }

  const document: Document | null = previewDocument
    ? previewDocument
    : artifact.status === "streaming"
      ? {
          content: artifact.content,
          createdAt: new Date(),
          id: artifact.documentId,
          kind: artifact.kind,
          title: artifact.title,
          userId: "noop",
        }
      : null;

  if (!document) {
    return <LoadingSkeleton artifactKind={artifact.kind} />;
  }

  const isOpen =
    workspace.open &&
    workspace.tab === "document" &&
    artifact.isVisible &&
    artifact.documentId === document.id;
  return (
    <div className="relative w-full max-w-[450px] overflow-hidden rounded-lg border border-border/70 bg-card transition-colors hover:border-ring/40 hover:bg-secondary/30">
      <HitboxLayer
        hitboxRef={hitboxRef}
        result={result}
        setArtifact={setArtifact}
      />
      <DocumentHeader
        isOpen={isOpen}
        isStreaming={artifact.status === "streaming"}
        kind={document.kind}
        title={document.title}
      />
      {!isOpen && <DocumentContent document={document} />}
    </div>
  );
}

const LoadingSkeleton = ({ artifactKind }: { artifactKind: ArtifactKind }) => (
  <div
    aria-busy="true"
    className="w-full max-w-[450px] overflow-hidden rounded-lg border border-border/70 bg-card"
  >
    <DocumentHeader
      isOpen={false}
      isStreaming={true}
      kind={artifactKind}
      title="正在准备产物…"
    />
  </div>
);

const PureHitboxLayer = ({
  hitboxRef,
  result,
  setArtifact,
}: {
  hitboxRef: React.RefObject<HTMLButtonElement>;
  result?: Partial<DocumentToolOutput>;
  setArtifact: (
    updaterFn: UIArtifact | ((currentArtifact: UIArtifact) => UIArtifact)
  ) => void;
}) => {
  const { show } = useWorkspace();
  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const boundingBox = event.currentTarget.getBoundingClientRect();

      setArtifact((artifact) =>
        openArtifactPreview(artifact, result ?? {}, {
          height: boundingBox.height,
          left: boundingBox.x,
          top: boundingBox.y,
          width: boundingBox.width,
        })
      );
      // Re-select the pane even when the artifact ID/visibility is unchanged.
      // Closing or switching workspace tabs does not mutate artifact state.
      show("document");
    },
    [setArtifact, result, show]
  );

  return (
    <button
      aria-label={`打开产物：${result?.title ?? "产物"}`}
      className="absolute top-0 left-0 z-10 size-full rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
      data-testid="document-preview"
      onClick={handleClick}
      ref={hitboxRef}
      type="button"
    >
      <div className="flex w-full items-center justify-end p-4">
        <div className="absolute top-5 right-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <FullscreenIcon />
        </div>
      </div>
    </button>
  );
};

const HitboxLayer = memo(PureHitboxLayer, (prevProps, nextProps) => {
  if (!equal(prevProps.result, nextProps.result)) {
    return false;
  }
  return true;
});

const PureDocumentHeader = ({
  title,
  kind,
  isStreaming,
  isOpen,
}: {
  title: string;
  kind: ArtifactKind;
  isStreaming: boolean;
  isOpen: boolean;
}) => (
  <div className="flex min-h-[72px] items-center gap-3 px-4 py-3 pr-12">
    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
      {isStreaming ? (
        <div className="animate-spin">
          <LoaderIcon size={16} />
        </div>
      ) : kind === "image" ? (
        <ImageIcon size={16} />
      ) : kind === "code" ? (
        <CodeIcon size={16} />
      ) : (
        <FileIcon size={16} />
      )}
    </div>
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="truncate text-sm font-medium">{title}</div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ArtifactTypeLabel kind={kind} />
        <span>
          {isStreaming ? "正在生成…" : isOpen ? "正在查看" : "点击打开"}
        </span>
      </div>
    </div>
  </div>
);

const DocumentHeader = memo(PureDocumentHeader, (prevProps, nextProps) => {
  if (prevProps.title !== nextProps.title) {
    return false;
  }
  if (prevProps.kind !== nextProps.kind) {
    return false;
  }
  if (prevProps.isOpen !== nextProps.isOpen) {
    return false;
  }
  if (prevProps.isStreaming !== nextProps.isStreaming) {
    return false;
  }

  return true;
});

const DocumentContent = ({ document }: { document: Document }) => {
  const { artifact } = useArtifact();

  const containerClassName = cn(
    "overflow-hidden border-t border-border/50 bg-background",
    {
      "p-0": document.kind === "code",
      "p-4": document.kind === "text",
    }
  );

  const commonProps = {
    content: document.content ?? "",
    currentVersionIndex: 0,
    isCurrentVersion: false,
    saveContent: () => null,
    status: artifact.status,
    suggestions: [],
  };

  const handleSaveContent = () => null;
  const table = parseResultTable(document.content);
  const previewLayout = documentPreviewLayout(table);

  return (
    <div
      className={cn(containerClassName, "relative")}
      style={{ height: previewLayout.height }}
    >
      {table ? (
        <ResultTableView
          inline
          key={`${document.id}:${new Date(document.createdAt).toISOString()}`}
          readOnly
          table={table}
        />
      ) : isProtectedResultTable(document.content) ? (
        <p className="p-4 text-xs">结果表格格式暂不支持，原始值保持只读。</p>
      ) : document.kind === "text" ? (
        <Editor
          {...commonProps}
          key={`${document.id}:${new Date(document.createdAt).toISOString()}`}
          onSaveContent={handleSaveContent}
        />
      ) : document.kind === "code" ? (
        <pre className="overflow-hidden px-4 py-3 text-xs leading-6 text-muted-foreground">
          <code>{document.content?.split("\n").slice(0, 5).join("\n")}</code>
        </pre>
      ) : document.kind === "sheet" ? (
        <div className="relative flex size-full flex-1 p-4">
          <div className="absolute inset-0">
            <SpreadsheetEditor {...commonProps} />
          </div>
        </div>
      ) : document.kind === "image" ? (
        <ImageEditor
          content={document.content ?? ""}
          currentVersionIndex={0}
          isCurrentVersion={true}
          isInline={true}
          status={artifact.status}
          title={document.title}
        />
      ) : null}
      {previewLayout.showFade ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-muted to-transparent dark:from-muted" />
      ) : null}
      {document.kind === "code" && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-muted to-transparent dark:from-muted" />
      )}
    </div>
  );
};

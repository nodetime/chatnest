"use client";

import equal from "fast-deep-equal";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
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
import { openArtifactPreview } from "@/lib/artifacts/stream-state";
import type { Document } from "@/lib/db/schema";
import { fetcher } from "@/lib/utils";
import type { ArtifactKind, UIArtifact } from "./artifact";
import { artifactTypeLabels } from "./artifact-type-label";
import { FileSymbol } from "./file-symbol";

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

  const {
    data: documents,
    isLoading: isDocumentsFetching,
    error,
  } = useSWR<Document[]>(
    result?.id
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

  // A historical entry must not inherit another document's generating state.
  const requestedId = result?.id ?? args?.id;
  const isStreaming =
    artifact.status === "streaming" &&
    (!requestedId || requestedId === artifact.documentId);
  const document =
    previewDocument ??
    (result?.id
      ? result
      : isStreaming
        ? {
            id: artifact.documentId,
            kind: artifact.kind,
            title: artifact.title,
          }
        : null);

  if (!document) {
    return (
      <div
        aria-busy={!error}
        className="w-full max-w-[450px] rounded-lg border border-border/60"
      >
        <DocumentHeader
          error={!!error}
          isLoading={!isStreaming && !error}
          isOpen={false}
          isStreaming={isStreaming}
          kind={args?.kind ?? artifact.kind}
          title={args?.title ?? "产物"}
        />
      </div>
    );
  }

  const isOpen =
    workspace.open &&
    workspace.tab === "document" &&
    artifact.isVisible &&
    artifact.documentId === document.id;
  return (
    <div
      aria-busy={isDocumentsFetching || isStreaming}
      className="relative w-full max-w-[450px] overflow-hidden rounded-lg border border-border/60 bg-background transition-colors hover:border-border hover:bg-muted/30"
    >
      <HitboxLayer
        hitboxRef={hitboxRef}
        result={{ id: document.id, kind: document.kind, title: document.title }}
        setArtifact={setArtifact}
      />
      <DocumentHeader
        error={!!error}
        isLoading={isDocumentsFetching}
        isOpen={isOpen}
        isStreaming={isStreaming}
        kind={document.kind ?? "text"}
        title={document.title ?? "产物"}
      />
    </div>
  );
}

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
      <ArrowUpRight
        aria-hidden="true"
        className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </button>
  );
};

const HitboxLayer = memo(PureHitboxLayer, (prevProps, nextProps) => {
  if (!equal(prevProps.result, nextProps.result)) {
    return false;
  }
  return true;
});

const DocumentHeader = ({
  title,
  kind,
  isStreaming,
  isOpen,
  isLoading = false,
  error = false,
}: {
  title: string;
  kind: ArtifactKind;
  isStreaming: boolean;
  isOpen: boolean;
  isLoading?: boolean;
  error?: boolean;
}) => (
  <div className="flex min-h-14 items-center gap-2.5 px-3 py-2.5 pr-10">
    <FileSymbol kind={kind} />
    <div className="min-w-0 flex-1">
      <div className="truncate text-[13px] font-medium" title={title}>
        {title}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span data-testid="artifact-type">{artifactTypeLabels[kind]}</span>
        <span aria-hidden="true">·</span>
        {!!(isStreaming || isLoading) && (
          <LoaderCircle
            aria-hidden="true"
            className="size-3 animate-spin motion-reduce:animate-none"
          />
        )}
        <span className={error ? "text-destructive" : undefined} role="status">
          {isStreaming
            ? "正在生成…"
            : isLoading
              ? "正在加载…"
              : error
                ? "加载失败"
                : isOpen
                  ? "正在查看"
                  : "打开"}
        </span>
      </div>
    </div>
  </div>
);

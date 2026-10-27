// biome-ignore-all lint/performance/noJsxPropsBind: Header slot renders in place without owning or remounting editor state.
import type { UseChatHelpers } from "@ai-sdk/react";
import { formatDistance } from "date-fns";
import { zhCN } from "date-fns/locale";
import equal from "fast-deep-equal";
import { AnimatePresence, motion } from "framer-motion";
import {
  type Dispatch,
  memo,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import useSWR, { useSWRConfig } from "swr";
import { useWindowSize } from "usehooks-ts";
import { codeArtifact } from "@/app/_artifacts/code/client";
import { imageArtifact } from "@/app/_artifacts/image/client";
import { sheetArtifact } from "@/app/_artifacts/sheet/client";
import { textArtifact } from "@/app/_artifacts/text/client";

import { Artifact as ArtifactFrame } from "@/app/_components/ai-elements/artifact";
import { useArtifact } from "@/app/_hooks/use-artifact";
import type { Attachment, ChatMessage } from "@/app/_lib/types";
import { cn, fetcher } from "@/app/_lib/utils";
import {
  isProtectedResultTable,
  parseResultTable,
} from "@/server/domain/document/result-table";
import type { Document } from "@/server/domain/document/types";
import type { Vote } from "@/server/domain/vote/types";
import { ArtifactActions } from "./artifact-actions";
import { artifactCatalog } from "./artifact-catalog";
import { ArtifactCloseButton } from "./artifact-close-button";
import { ArtifactPicker } from "./artifact-picker";
import { ArtifactTypeLabel } from "./artifact-type-label";
import { LoaderIcon } from "./icons";
import { Toolbar } from "./toolbar";
import { VersionFooter } from "./version-footer";
import type { VisibilityType } from "./visibility-selector";
import { WorkspaceHeader } from "./workspace-header";

export const artifactDefinitions = [
  textArtifact,
  codeArtifact,
  imageArtifact,
  sheetArtifact,
];
export type ArtifactKind = (typeof artifactDefinitions)[number]["kind"];

export type { UIArtifact } from "@/server/domain/document/types";

function PureArtifact({
  addToolApprovalResponse: _addToolApprovalResponse,
  chatId,
  input: _input,
  setInput: _setInput,
  status,
  stop,
  attachments: _attachments,
  setAttachments: _setAttachments,
  sendMessage,
  messages,
  setMessages,
  regenerate: _regenerate,
  votes: _votes,
  isReadonly,
  selectedVisibilityType: _selectedVisibilityType,
  selectedModelId: _selectedModelId,
  embedded = false,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: UseChatHelpers<ChatMessage>["stop"];
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  votes: Vote[] | undefined;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  embedded?: boolean;
}) {
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();

  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Document[]>(
    artifact.documentId !== "init" && artifact.status !== "streaming"
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/document?id=${artifact.documentId}&chatId=${chatId}`
      : null,
    fetcher
  );

  const [mode, setMode] = useState<"edit" | "diff">("edit");
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);

  const artifactContentRef = useRef<HTMLDivElement>(null);
  const userScrolledArtifact = useRef(false);
  const [isContentDirty, setIsContentDirty] = useState(false);
  const [saveError, setSaveError] = useState("");
  const activeScopeRef = useRef({ chatId, documentId: artifact.documentId });
  if (
    activeScopeRef.current.chatId !== chatId ||
    activeScopeRef.current.documentId !== artifact.documentId
  ) {
    activeScopeRef.current = { chatId, documentId: artifact.documentId };
  }
  const scope = activeScopeRef.current;
  // SWR's bound mutator follows the latest key. Guard async editor/initializer
  // callbacks before forwarding so they cannot write another file's metadata.
  const setScopedMetadata = useCallback<typeof setMetadata>(
    (...args) => {
      if (activeScopeRef.current !== scope) {
        return Promise.resolve();
      }
      return setMetadata(...args);
    },
    [scope, setMetadata]
  );
  const loadedIdRef = useRef("");
  const editRevisionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset transient editor state for each document/chat visit.
  useEffect(() => {
    setIsContentDirty(false);
    setSaveError("");
    setDocument(null);
    setMode("edit");
    setCurrentVersionIndex(-1);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [scope]);

  useEffect(() => {
    if (artifact.status !== "streaming") {
      userScrolledArtifact.current = false;
      return;
    }
    if (userScrolledArtifact.current) {
      return;
    }
    const el = artifactContentRef.current;
    if (!el) {
      return;
    }
    el.scrollTo({ top: el.scrollHeight });
  }, [artifact.status]);

  useEffect(() => {
    const latest = documents?.at(-1);
    if (!documents || !latest || latest.id !== artifact.documentId) {
      return;
    }
    const changed = loadedIdRef.current !== artifact.documentId;
    loadedIdRef.current = artifact.documentId;
    setDocument(latest);
    if (changed || currentVersionIndex === -1) {
      setCurrentVersionIndex(documents.length - 1);
    }
    if (
      !isContentDirty &&
      (changed ||
        currentVersionIndex === -1 ||
        currentVersionIndex === documents.length - 1)
    ) {
      setArtifact((current) =>
        current.documentId === latest.id
          ? { ...current, content: latest.content ?? "" }
          : current
      );
    }
  }, [
    documents,
    artifact.documentId,
    currentVersionIndex,
    isContentDirty,
    setArtifact,
  ]);

  const { mutate } = useSWRConfig();
  const handleContentChange = useCallback(
    async (
      updatedContent: string,
      snapshot: {
        id: string;
        kind: ArtifactKind;
        title: string;
        chatId: string;
        scope: typeof scope;
      },
      revision: number
    ) => {
      const key = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/document?id=${snapshot.id}&chatId=${snapshot.chatId}`;
      try {
        const response = await fetch(key, {
          body: JSON.stringify({
            content: updatedContent,
            isManualEdit: true,
            kind: snapshot.kind,
            title: snapshot.title,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (!response.ok) {
          throw new Error("保存失败，修改尚未保存，请重试。");
        }
        await mutate<Document[]>(
          key,
          (current) =>
            current?.map((doc, index) =>
              index === current.length - 1
                ? { ...doc, content: updatedContent }
                : doc
            ),
          { revalidate: false }
        );
        if (
          activeScopeRef.current === snapshot.scope &&
          editRevisionRef.current === revision
        ) {
          setIsContentDirty(false);
          setSaveError("");
        }
      } catch (error) {
        if (
          activeScopeRef.current === snapshot.scope &&
          editRevisionRef.current === revision
        ) {
          setIsContentDirty(true);
          setSaveError(
            error instanceof Error ? error.message : "保存失败，请重试。"
          );
        }
      }
    },
    [mutate]
  );
  const saveContent = useCallback(
    (updatedContent: string, debounce: boolean) => {
      if (
        activeScopeRef.current !== scope ||
        isReadonly ||
        (documents?.length && currentVersionIndex !== documents.length - 1) ||
        isProtectedResultTable(artifact.content)
      ) {
        return;
      }
      setArtifact((current) =>
        current.documentId === artifact.documentId
          ? { ...current, content: updatedContent }
          : current
      );
      setIsContentDirty(true);
      setSaveError("");
      editRevisionRef.current += 1;
      const revision = editRevisionRef.current;
      const snapshot = {
        chatId,
        id: artifact.documentId,
        kind: artifact.kind,
        scope,
        title: artifact.title,
      };
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (debounce) {
        saveTimerRef.current = setTimeout(() => {
          handleContentChange(updatedContent, snapshot, revision);
          saveTimerRef.current = null;
        }, 2000);
      } else {
        handleContentChange(updatedContent, snapshot, revision);
      }
    },
    [
      artifact,
      chatId,
      currentVersionIndex,
      documents,
      handleContentChange,
      isReadonly,
      scope,
      setArtifact,
    ]
  );
  useEffect(() => {
    setScopedMetadata((current: Record<string, unknown> | null) => ({
      ...current,
      documentPendingChanges: isContentDirty,
    }));
  }, [isContentDirty, setScopedMetadata]);

  const handleResultTablePendingChange = useCallback(
    (pending: boolean) => {
      // A previous table can finish/clean up after a different file is opened.
      // Bound SWR metadata mutators follow the latest key; check viewer identity first.
      if (activeScopeRef.current !== scope) {
        return;
      }
      setMetadata((current: Record<string, unknown> | null) => ({
        ...current,
        resultTablePendingChanges: pending,
      }));
    },
    [scope, setMetadata]
  );
  const handleResultTableSaved = useCallback(
    async (content: string) => {
      const id = artifact.documentId;
      if (activeScopeRef.current !== scope) {
        return;
      }
      await mutateDocuments();
      if (activeScopeRef.current === scope) {
        setArtifact((current) =>
          current.documentId === id ? { ...current, content } : current
        );
        setCurrentVersionIndex(-1);
      }
    },
    [artifact.documentId, mutateDocuments, scope, setArtifact]
  );

  const getDocumentContentById = useCallback(
    (index: number) => {
      if (!documents) {
        return "";
      }
      if (!documents[index] || documents[index].id !== artifact.documentId) {
        return "";
      }
      return documents[index].content ?? "";
    },
    [artifact.documentId, documents]
  );

  const handleVersionChange = useCallback(
    (type: "next" | "prev" | "toggle" | "latest") => {
      if (activeScopeRef.current !== scope || !documents) {
        return;
      }

      if (type === "latest") {
        setCurrentVersionIndex(documents.length - 1);
        setMode("edit");
      }

      if (type === "toggle") {
        setMode((currentMode) => (currentMode === "edit" ? "diff" : "edit"));
      }

      if (type === "prev") {
        if (currentVersionIndex > 0) {
          setCurrentVersionIndex((index) => index - 1);
        }
      } else if (
        type === "next" &&
        currentVersionIndex < documents.length - 1
      ) {
        setCurrentVersionIndex((index) => index + 1);
      }
    },
    [currentVersionIndex, documents, scope]
  );

  const handleArtifactScroll = useCallback(() => {
    const el = artifactContentRef.current;
    if (!el) {
      return;
    }
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    userScrolledArtifact.current = !atBottom;
  }, []);

  const isCurrentVersion =
    documents && documents.length > 0
      ? currentVersionIndex === documents.length - 1
      : true;

  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const isMobile = windowWidth ? windowWidth < 768 : false;

  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind
  );

  if (!artifactDefinition) {
    throw new Error("Artifact definition not found!");
  }

  useEffect(() => {
    if (artifact.documentId !== "init" && artifactDefinition.initialize) {
      artifactDefinition.initialize({
        documentId: artifact.documentId,
        setMetadata: setScopedMetadata,
      });
    }
  }, [artifact.documentId, artifactDefinition, setScopedMetadata]);

  if (!artifact.isVisible && !isMobile) {
    return (
      <div
        className="h-dvh w-0 shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        data-testid="artifact"
      />
    );
  }

  if (!artifact.isVisible) {
    return null;
  }

  const hasPendingResultTableChanges =
    isCurrentVersion &&
    !isReadonly &&
    isProtectedResultTable(artifact.content) &&
    metadata?.resultTablePendingChanges === true;

  const consoleError =
    metadata?.outputs
      ?.filter((o: { status: string }) => o.status === "failed")
      .flatMap((o: { contents: { type: string; value: string }[] }) =>
        o.contents.filter((c) => c.type === "text").map((c) => c.value)
      )
      .join("\n") || undefined;

  const displayedContent = isCurrentVersion
    ? artifact.content
    : getDocumentContentById(currentVersionIndex);
  const tableOwnsHeader =
    artifact.kind === "sheet" && !!parseResultTable(displayedContent);
  const renderHeader = (controls?: ReactNode) => (
    <WorkspaceHeader
      actions={
        !tableOwnsHeader && (
          <div className="flex shrink-0 items-center gap-0.5">
            <ArtifactActions
              artifact={{ ...artifact, content: displayedContent }}
              currentVersionIndex={currentVersionIndex}
              handleVersionChange={handleVersionChange}
              isCurrentVersion={isCurrentVersion}
              isReadonly={isReadonly || !isCurrentVersion}
              layout="header"
              metadata={metadata}
              mode={mode}
              setMetadata={setScopedMetadata}
            />
            {isCurrentVersion && !isReadonly && (
              <Toolbar
                artifactKind={artifact.kind}
                consoleError={consoleError}
                documentId={artifact.documentId}
                sendMessage={sendMessage}
                setMessages={setMessages}
                status={status}
                stop={stop}
              />
            )}
          </div>
        )
      }
      controls={controls}
    >
      <div className="flex min-w-0 flex-col items-start justify-center gap-1">
        {!embedded && <ArtifactCloseButton />}
        <div
          className="flex min-w-0 items-center gap-2"
          title={
            document
              ? `更新于${formatDistance(new Date(document.createdAt), new Date(), { addSuffix: true, locale: zhCN })}`
              : undefined
          }
        >
          <ArtifactPicker
            activeId={artifact.documentId}
            entries={artifactCatalog(messages)}
            isContentDirty={isContentDirty}
            resultTablePendingChanges={hasPendingResultTableChanges}
            status={artifact.status}
            title={artifact.title}
          />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <ArtifactTypeLabel kind={artifact.kind} />
          {saveError ? (
            <span className="truncate text-xs text-destructive" role="alert">
              {saveError}
            </span>
          ) : hasPendingResultTableChanges ? (
            <span className="truncate text-xs text-muted-foreground">
              表格视图或备注尚未保存 · 暂不能切换
            </span>
          ) : isContentDirty ? (
            <span className="text-xs text-muted-foreground">
              正在保存… · 暂不能切换
            </span>
          ) : artifact.status === "streaming" ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LoaderIcon size={12} />
              正在生成… · 暂不能切换
            </span>
          ) : null}
        </div>
      </div>
    </WorkspaceHeader>
  );
  const artifactPanel = (
    <>
      {!tableOwnsHeader && renderHeader()}
      <div
        className={cn(
          "relative min-h-0 min-w-0 flex-1 bg-background",
          isProtectedResultTable(artifact.content)
            ? "flex overflow-hidden"
            : "overflow-y-auto"
        )}
        data-slot="artifact-content"
        onScroll={handleArtifactScroll}
        ref={artifactContentRef}
      >
        <artifactDefinition.content
          content={
            isCurrentVersion
              ? artifact.content
              : getDocumentContentById(currentVersionIndex)
          }
          currentVersionIndex={currentVersionIndex}
          documentId={artifact.documentId}
          expectedVersion={
            documents?.[currentVersionIndex]?.createdAt
              ? new Date(documents[currentVersionIndex].createdAt).toISOString()
              : undefined
          }
          getDocumentContentById={getDocumentContentById}
          isCurrentVersion={isCurrentVersion}
          isInline={false}
          isLoading={isDocumentsFetching && !artifact.content}
          isReadonly={isReadonly}
          metadata={metadata}
          mode={mode}
          onResultTablePendingChange={handleResultTablePendingChange}
          onResultTableSaved={handleResultTableSaved}
          onSaveContent={saveContent}
          renderHeader={renderHeader}
          setMetadata={setScopedMetadata}
          status={artifact.status}
          suggestions={[]}
          title={artifact.title}
        />
      </div>
      <AnimatePresence>
        {documents && documents.length > 1 && (
          <VersionFooter
            chatId={chatId}
            currentVersionIndex={currentVersionIndex}
            documents={documents}
            handleVersionChange={handleVersionChange}
            isReadonly={isReadonly}
            mode={mode}
            setMode={setMode}
          />
        )}
      </AnimatePresence>
    </>
  );

  if (isMobile && !embedded) {
    return (
      <motion.div
        animate={{
          borderRadius: 0,
          height: windowHeight,
          opacity: 1,
          width: "100dvw",
          x: 0,
          y: 0,
        }}
        className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-background"
        data-testid="artifact"
        exit={{ opacity: 0, scale: 0.95 }}
        initial={{
          borderRadius: 50,
          height: artifact.boundingBox.height,
          opacity: 1,
          width: artifact.boundingBox.width,
          x: artifact.boundingBox.left,
          y: artifact.boundingBox.top,
        }}
        transition={{ damping: 30, stiffness: 300, type: "spring" }}
      >
        {artifactPanel}
      </motion.div>
    );
  }

  return (
    <ArtifactFrame
      className={
        embedded
          ? "flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-none border-0 bg-background shadow-none"
          : "flex h-dvh w-[60%] shrink-0 flex-col overflow-hidden border-l border-border/60 bg-background transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      }
      data-testid="artifact"
    >
      {artifactPanel}
    </ArtifactFrame>
  );
}

export const Artifact = memo(PureArtifact, (prevProps, nextProps) => {
  if (
    prevProps.isReadonly !== nextProps.isReadonly ||
    prevProps.chatId !== nextProps.chatId
  ) {
    return false;
  }
  if (prevProps.status !== nextProps.status) {
    return false;
  }
  if (!equal(prevProps.votes, nextProps.votes)) {
    return false;
  }
  if (prevProps.input !== nextProps.input) {
    return false;
  }
  if (prevProps.messages !== nextProps.messages) {
    return false;
  }
  if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
    return false;
  }

  return true;
});

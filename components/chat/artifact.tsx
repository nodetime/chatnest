import type { UseChatHelpers } from "@ai-sdk/react";
import { formatDistance } from "date-fns";
import { zhCN } from "date-fns/locale";
import equal from "fast-deep-equal";
import { AnimatePresence, motion } from "framer-motion";
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import useSWR, { useSWRConfig } from "swr";
import { useWindowSize } from "usehooks-ts";
import { codeArtifact } from "@/artifacts/code/client";
import { imageArtifact } from "@/artifacts/image/client";
import { sheetArtifact } from "@/artifacts/sheet/client";
import { textArtifact } from "@/artifacts/text/client";

import { useArtifact } from "@/hooks/use-artifact";
import { isProtectedResultTable } from "@/lib/artifacts/result-table";
import type { Document, Vote } from "@/lib/db/schema";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn, fetcher } from "@/lib/utils";
import { ArtifactActions } from "./artifact-actions";
import { ArtifactCloseButton } from "./artifact-close-button";
import { ArtifactTypeLabel } from "./artifact-type-label";
import { LoaderIcon } from "./icons";
import { Toolbar } from "./toolbar";
import { VersionFooter } from "./version-footer";
import type { VisibilityType } from "./visibility-selector";

export const artifactDefinitions = [
  textArtifact,
  codeArtifact,
  imageArtifact,
  sheetArtifact,
];
export type ArtifactKind = (typeof artifactDefinitions)[number]["kind"];

export type UIArtifact = {
  title: string;
  documentId: string;
  kind: ArtifactKind;
  content: string;
  isVisible: boolean;
  status: "streaming" | "idle";
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
};

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
  messages: _messages,
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
  const activeIdRef = useRef(artifact.documentId);
  activeIdRef.current = artifact.documentId;
  const loadedIdRef = useRef("");
  const editRevisionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    activeIdRef.current = artifact.documentId;
    setIsContentDirty(false);
    setSaveError("");
    setDocument(null);
    setCurrentVersionIndex(-1);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [artifact.documentId]);

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
          activeIdRef.current === snapshot.id &&
          editRevisionRef.current === revision
        ) {
          setIsContentDirty(false);
          setSaveError("");
        }
      } catch (error) {
        if (
          activeIdRef.current === snapshot.id &&
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
      setArtifact,
    ]
  );
  const handleResultTableSaved = useCallback(
    async (content: string) => {
      const id = artifact.documentId;
      await mutateDocuments();
      if (activeIdRef.current === id) {
        setArtifact((current) =>
          current.documentId === id ? { ...current, content } : current
        );
        setCurrentVersionIndex(-1);
      }
    },
    [artifact.documentId, mutateDocuments, setArtifact]
  );

  const getDocumentContentById = useCallback(
    (index: number) => {
      if (!documents) {
        return "";
      }
      if (!documents[index]) {
        return "";
      }
      return documents[index].content ?? "";
    },
    [documents]
  );

  const handleVersionChange = useCallback(
    (type: "next" | "prev" | "toggle" | "latest") => {
      if (!documents) {
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
    [currentVersionIndex, documents]
  );

  const handleArtifactScroll = useCallback(() => {
    const el = artifactContentRef.current;
    if (!el) {
      return;
    }
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    userScrolledArtifact.current = !atBottom;
  }, []);

  const handleClose = useCallback(() => {
    setArtifact((prev) => ({ ...prev, isVisible: false }));
  }, [setArtifact]);

  const [isToolbarVisible, setIsToolbarVisible] = useState(true);

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
        setMetadata,
      });
    }
  }, [artifact.documentId, artifactDefinition, setMetadata]);

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

  const consoleError =
    metadata?.outputs
      ?.filter((o: { status: string }) => o.status === "failed")
      .flatMap((o: { contents: { type: string; value: string }[] }) =>
        o.contents.filter((c) => c.type === "text").map((c) => c.value)
      )
      .join("\n") || undefined;

  const artifactPanel = (
    <>
      <div
        className={cn(
          "flex min-w-0 shrink-0 items-center justify-between border-b border-border/50 px-3",
          embedded ? "h-11" : "h-[calc(3.5rem+1px)]"
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {!embedded && <ArtifactCloseButton />}
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <ArtifactTypeLabel kind={artifact.kind} />
              <div className="truncate text-sm font-semibold leading-tight tracking-tight">
                {artifact.title}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saveError ? (
                <div className="text-xs text-destructive" role="alert">
                  {saveError}
                </div>
              ) : isContentDirty ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                  正在保存…
                </div>
              ) : document ? (
                <div className="text-xs text-muted-foreground">
                  {`更新于${formatDistance(new Date(document.createdAt), new Date(), { addSuffix: true, locale: zhCN })}`}
                </div>
              ) : artifact.status === "streaming" ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="animate-spin">
                    <LoaderIcon size={12} />
                  </div>
                  正在生成…
                </div>
              ) : (
                <div className="h-3 w-24 animate-pulse rounded bg-muted-foreground/10" />
              )}
            </div>
          </div>
        </div>
        {isCurrentVersion &&
          !isReadonly &&
          !isProtectedResultTable(artifact.content) && (
            <ArtifactActions
              artifact={artifact}
              currentVersionIndex={currentVersionIndex}
              handleVersionChange={handleVersionChange}
              isCurrentVersion={isCurrentVersion}
              layout="header"
              metadata={metadata}
              mode={mode}
              setMetadata={setMetadata}
            />
          )}
      </div>
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
          onResultTableSaved={handleResultTableSaved}
          onSaveContent={saveContent}
          setMetadata={setMetadata}
          status={artifact.status}
          suggestions={[]}
          title={artifact.title}
        />
        <AnimatePresence>
          {isCurrentVersion &&
          !isReadonly &&
          !isProtectedResultTable(artifact.content) ? (
            <Toolbar
              artifactKind={artifact.kind}
              consoleError={consoleError}
              documentId={artifact.documentId}
              isToolbarVisible={isToolbarVisible}
              onClose={handleClose}
              sendMessage={sendMessage}
              setIsToolbarVisible={setIsToolbarVisible}
              setMessages={setMessages}
              status={status}
              stop={stop}
            />
          ) : null}
        </AnimatePresence>
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
        className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-sidebar"
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
    <div
      className={
        embedded
          ? "flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
          : "flex h-dvh w-[60%] shrink-0 flex-col overflow-hidden border-l border-border/50 bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      }
      data-testid="artifact"
    >
      {artifactPanel}
    </div>
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
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false;
  }
  if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
    return false;
  }

  return true;
});

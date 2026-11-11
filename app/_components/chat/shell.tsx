// biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes the consumer service notice action.
"use client";

import { ArrowDown } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/_components/ui/alert-dialog";
import { useActiveChat } from "@/app/_hooks/use-active-chat";
import {
  initialArtifactData,
  useArtifact,
  useArtifactSelector,
} from "@/app/_hooks/use-artifact";
import { useWorkbenchNavigation } from "@/app/_hooks/use-workbench-navigation";
import { useWorkspace } from "@/app/_hooks/use-workspace";
import type { Attachment, ChatMessage } from "@/app/_lib/types";
import { cn } from "@/app/_lib/utils";
import type { Document } from "@/server/domain/document/types";
import { Artifact } from "./artifact";
import { ChatHeader } from "./chat-header";
import { ConversationNotice } from "./conversation-notice";
import { DataStreamHandler } from "./data-stream-handler";
import { Greeting, TaskExamples } from "./greeting";
import { submitEditedMessage } from "./message-editor";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { TaskProgress } from "./task-progress";
import { WorkbenchSection } from "./workbench-section";
import { Workspace } from "./workspace";
import { WorkspaceHome } from "./workspace-home";

export function ChatShell() {
  const {
    chatId,
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    regenerateAnswer,
    addToolApprovalResponse,
    answerAskUser,
    reviseAskUser,
    input,
    setInput,
    visibilityType,
    isReadonly,
    isLoading,
    votes,
    currentModelId,
    setCurrentModelId,
    showCreditCardAlert,
    setShowCreditCardAlert,
    clearError,
    error,
    getSendError,
    loadError,
    taskProgress,
    isTaskProgressRunning,
  } = useActiveChat();

  const { section, navigate } = useWorkbenchNavigation();
  const workspace = useWorkspace();
  const search = useSearchParams();
  const requestedArtifact = search.get("artifact");
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(
    null
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const editGenerationRef = useRef({ chatId, generation: 0 });
  if (editGenerationRef.current.chatId !== chatId) {
    editGenerationRef.current = {
      chatId,
      generation: editGenerationRef.current.generation + 1,
    };
  }
  const draftAssetsRef = useRef(attachments);
  draftAssetsRef.current = attachments;
  useEffect(
    () => () => {
      if (!chatId) {
        return;
      }
      // This component owns the shared draft. Removing a composer surface alone
      // must never delete it; used assets are independently protected by the API.
      for (const attachment of draftAssetsRef.current) {
        fetch(attachment.url, { method: "DELETE" }).catch(() => undefined);
      }
    },
    [chatId]
  );
  const isEmpty = messages.length === 0 && !isLoading && !loadError;
  const isHistoryUnavailable = messages.length === 0 && Boolean(loadError);
  const composerRef = useRef<HTMLDivElement>(null);
  const homeScrollRef = useRef<HTMLDivElement>(null);
  const recentArtifactsRef = useRef<HTMLDivElement>(null);
  const handleSelectTaskExample = useCallback(
    (prompt: string) => {
      setInput(prompt);
      composerRef.current
        ?.querySelector<HTMLTextAreaElement>("textarea")
        ?.focus({ preventScroll: true });
    },
    [setInput]
  );
  const handleScrollToArtifacts = useCallback(() => {
    if (homeScrollRef.current && recentArtifactsRef.current) {
      homeScrollRef.current.scrollTo({
        top: recentArtifactsRef.current.offsetTop,
      });
    }
  }, []);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);
  const { setArtifact } = useArtifact();

  const stopRef = useRef(stop);

  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      stopRef.current();
      setArtifact(initialArtifactData);
      setEditingMessage(null);
      setAttachments([]);
      navigate("chat");
    }
    stopRef.current = stop;
  }, [chatId, setArtifact, stop, navigate]);

  useEffect(() => {
    if (!requestedArtifact) {
      return;
    }
    let cancelled = false;
    fetch(
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/document?id=${encodeURIComponent(requestedArtifact)}&chatId=${encodeURIComponent(chatId)}`
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error("not found");
        }
        return response.json() as Promise<Document[]>;
      })
      .then((documents) => {
        const latest = documents.at(-1);
        if (!cancelled && latest) {
          setArtifact((current) => ({
            ...current,
            content: latest.content ?? "",
            documentId: latest.id,
            isVisible: true,
            kind: latest.kind,
            status: "idle",
            title: latest.title,
          }));
          workspace.show("document");
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("这份产物暂时未能打开，请从产物列表重试。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chatId, requestedArtifact, setArtifact, workspace.show]);

  const handleEditMessage = useCallback(
    (msg: ChatMessage) => {
      const text = msg.parts
        ?.filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("");
      setInput(text ?? "");
      setEditingMessage(msg);
    },
    [setInput]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
    setInput("");
  }, [setInput]);
  const handleRestore = useCallback(() => {
    const lastUser = messages.findLast((message) => message.role === "user");
    if (!lastUser) {
      return;
    }
    setInput(
      lastUser.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
    );
    setAttachments(
      lastUser.parts
        .filter((part) => part.type === "file")
        .map((part) => ({
          contentType: part.mediaType,
          name: part.filename ?? "图片",
          url: part.url,
        }))
    );
    clearError();
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLTextAreaElement>("[data-testid='multimodal-input']")
        ?.focus()
    );
  }, [messages, setInput, clearError]);

  const handleSendEditedMessage = useCallback(async () => {
    if (!editingMessage) {
      return;
    }

    const msg = editingMessage;
    const { generation } = editGenerationRef.current;
    try {
      const committed = await submitEditedMessage({
        getSendError,
        isCurrent: () => generation === editGenerationRef.current.generation,
        message: msg,
        regenerate,
        setInput,
        setMessages,
        snapshot: messages,
        text: input,
      });
      if (!committed) {
        return;
      }
      setEditingMessage(null);
    } catch {
      if (generation !== editGenerationRef.current.generation) {
        return;
      }
      toast.error("修改没有提交，草稿已保留。请稍后重试，或取消修改。");
    }
  }, [
    editingMessage,
    getSendError,
    input,
    messages,
    regenerate,
    setInput,
    setMessages,
  ]);

  const notice = (
    <ConversationNotice
      attachments={attachments}
      onRestore={handleRestore}
      standalone={isHistoryUnavailable}
    />
  );

  return (
    <>
      {section !== "chat" && <WorkbenchSection />}
      <div
        className={cn(
          "chat-workbench-shell flex h-dvh w-full min-w-0 flex-row overflow-hidden",
          section !== "chat" && "hidden"
        )}
      >
        <div className="chat-workbench-surface flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <div className={isEmpty ? "md:hidden" : undefined}>
            <ChatHeader
              chatId={chatId}
              isReadonly={isReadonly}
              selectedVisibilityType={visibilityType}
            />
          </div>
          <div
            className={cn(
              "relative flex min-h-0 flex-1 flex-col overflow-hidden",
              isEmpty &&
                "chat-home-canvas overflow-y-auto bg-[var(--workbench-canvas)]"
            )}
            ref={homeScrollRef}
          >
            {isHistoryUnavailable ? (
              <div
                className="min-h-0 flex-1 overflow-y-auto px-6"
                data-testid="history-load-failure"
              >
                <div className="grid min-h-full place-items-center py-6">
                  <div className="w-full max-w-sm">{notice}</div>
                </div>
              </div>
            ) : isEmpty ? null : (
              <Messages
                addToolApprovalResponse={addToolApprovalResponse}
                answerAskUser={answerAskUser}
                chatId={chatId}
                isArtifactVisible={isArtifactVisible}
                isReadonly={isReadonly}
                messages={messages}
                onEditMessage={handleEditMessage}
                onRegenerateAnswer={regenerateAnswer}
                regenerate={regenerate}
                reviseAskUser={reviseAskUser}
                selectedModelId={currentModelId}
                setMessages={setMessages}
                status={status}
                suppressLatestRunFailure={Boolean(error || loadError)}
                votes={votes}
              />
            )}
            {!isHistoryUnavailable && (
              <div
                className={
                  isEmpty
                    ? "chat-home-start-screen flex min-w-0 shrink-0 flex-col"
                    : "contents"
                }
              >
                <div
                  className={cn(
                    "mx-auto flex w-full min-w-0 shrink-0 flex-col max-w-[800px] px-4 sm:px-6",
                    isEmpty ? "my-auto" : "pt-2 pb-4"
                  )}
                  data-testid="composer-dock"
                  ref={composerRef}
                >
                  {!!isEmpty && <Greeting />}
                  {!isEmpty && (
                    <TaskProgress
                      isRunning={isTaskProgressRunning}
                      key={chatId}
                      plan={taskProgress}
                    />
                  )}
                  {notice}
                  {!isReadonly && (
                    <MultimodalInput
                      attachments={attachments}
                      chatId={chatId}
                      editingMessage={editingMessage}
                      home={isEmpty}
                      input={input}
                      isLoading={isLoading}
                      messages={messages}
                      onCancelEdit={handleCancelEdit}
                      onModelChange={setCurrentModelId}
                      selectedModelId={currentModelId}
                      selectedVisibilityType={visibilityType}
                      sendMessage={
                        editingMessage ? handleSendEditedMessage : sendMessage
                      }
                      setAttachments={setAttachments}
                      setInput={setInput}
                      setMessages={setMessages}
                      status={status}
                      stop={stop}
                    />
                  )}
                  {isEmpty && !isReadonly && (
                    <TaskExamples onSelect={handleSelectTaskExample} />
                  )}
                </div>
                {!!isEmpty && (
                  <div className="flex shrink-0 justify-center px-4 pt-8">
                    <button
                      aria-label="向下查看最近产物"
                      className="inline-flex items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs text-muted-foreground transition-colors hover:border-ring/30 hover:text-foreground"
                      onClick={handleScrollToArtifacts}
                      type="button"
                    >
                      向下查看最近产物
                      <ArrowDown aria-hidden="true" className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
            {!!isEmpty && (
              <div
                className="chat-home-recent-screen min-w-0 shrink-0 border-t border-border py-8 sm:pt-12 sm:pb-20"
                data-testid="home-recent-artifacts"
                ref={recentArtifactsRef}
              >
                <WorkspaceHome />
              </div>
            )}
          </div>
        </div>
        <Workspace>
          <Artifact
            addToolApprovalResponse={addToolApprovalResponse}
            attachments={attachments}
            chatId={chatId}
            embedded
            input={input}
            isReadonly={isReadonly}
            messages={messages}
            regenerate={regenerate}
            selectedModelId={currentModelId}
            selectedVisibilityType={visibilityType}
            sendMessage={sendMessage}
            setAttachments={setAttachments}
            setInput={setInput}
            setMessages={setMessages}
            status={status}
            stop={stop}
            votes={votes}
          />
        </Workspace>
      </div>

      <DataStreamHandler />

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>对话服务暂不可用</AlertDialogTitle>
            <AlertDialogDescription>
              当前模型服务需要管理员处理。草稿已保留，你可以稍后重试。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowCreditCardAlert(false)}>
              知道了
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

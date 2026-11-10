"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Chat, useChat } from "@ai-sdk/react";
import { type ChatInit, type ChatTransport, DefaultChatTransport } from "ai";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { projectChatTitle } from "@/app/_components/chat/chat-title";
import { useDataStream } from "@/app/_components/chat/data-stream-provider";
import { getChatHistoryPaginationKey } from "@/app/_components/chat/sidebar-history";
import type { VisibilityType } from "@/app/_components/chat/visibility-selector";
import { useAutoResume } from "@/app/_hooks/use-auto-resume";
import { useChatDraft } from "@/app/_hooks/use-chat-draft";
import type { ChatMessage } from "@/app/_lib/types";
import {
  fetcher,
  fetchWithErrorHandlers,
  generateUUID,
} from "@/app/_lib/utils";
import type { CapabilitySelection } from "@/server/domain/capability/schema";
import {
  type AskUserOutput,
  compactInteractionResponses,
  deriveTaskProgress,
  hasSavedAskResponse,
  interactionResponseSignature,
  shouldContinueAgent,
  type TodoPlan,
  validateAskUserOutput,
} from "@/server/domain/message/agent-interactions";
import {
  hasRunFailure,
  isCompleteFinishReason,
} from "@/server/domain/message/run-failure";
import {
  buildTaskMessage,
  type TaskDraft,
} from "@/server/domain/message/task-draft";
import { DEFAULT_CHAT_MODEL } from "@/server/domain/model/models";
import type { Vote } from "@/server/domain/vote/types";
import { ChatbotError } from "@/server/shared/errors";

type ActiveChatContextValue = {
  chatId: string;
  capabilitySelection: CapabilitySelection | undefined;
  setCapabilitySelection: (value: CapabilitySelection) => void;
  chatTitle: string;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  getSendError: () => Error | undefined;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: UseChatHelpers<ChatMessage>["stop"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  answerAskUser: (response: {
    messageId: string;
    toolCallId: string;
    output: AskUserOutput;
  }) => Promise<void>;
  reviseAskUser: (response: {
    messageId: string;
    toolCallId: string;
    output: AskUserOutput;
  }) => Promise<void>;
  taskProgress: TodoPlan | null;
  isTaskProgressRunning: boolean;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  visibilityType: VisibilityType;
  isReadonly: boolean;
  isLoading: boolean;
  votes: Vote[] | undefined;
  currentModelId: string;
  setCurrentModelId: (id: string) => void;
  showCreditCardAlert: boolean;
  setShowCreditCardAlert: Dispatch<SetStateAction<boolean>>;
  startNewChat: () => void;
  startTask: (draft: TaskDraft, useWeb: boolean) => void;
  error: Error | undefined;
  clearError: () => void;
  loadError: Error | undefined;
  retryLoad: () => void;
  searchMode: "auto" | "web";
  setSearchMode: Dispatch<SetStateAction<"auto" | "web">>;
  regenerateAnswer: () => Promise<void>;
};

const ActiveChatContext = createContext<ActiveChatContextValue | null>(null);

const PENDING_HISTORY_WAIT_MS = 3000;
const PENDING_HISTORY_RECHECK_MS = 250;
type ExpectedHistory = { id: string; kind: "reply" | "failure"; until: number };

function historyContainsTurn(
  history: ChatMessage[],
  expected: ExpectedHistory
) {
  if (expected.kind === "reply") {
    return history.some(({ id }) => id === expected.id);
  }
  // A failed stream may end before sending the server assistant ID.
  const start = history.findIndex(
    (message) => message.role === "user" && message.id === expected.id
  );
  return (
    start >= 0 &&
    history[start + 1] !== undefined &&
    hasRunFailure(history[start + 1])
  );
}

function hasReplyContent(message: ChatMessage) {
  return message.parts.some((part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return Boolean(part.text.trim());
    }
    return (
      part.type === "file" ||
      part.type === "dynamic-tool" ||
      part.type.startsWith("tool-")
    );
  });
}

function extractChatId(pathname: string): string | null {
  const match = pathname.match(/\/chat\/([^/]+)/);
  return match ? match[1] : null;
}

export function ActiveChatProvider({
  children,
  ownerId = "local",
}: {
  children: ReactNode;
  ownerId?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [, refreshNewChat] = useState(0);
  const { setDataStream, setWaitingStatus } = useDataStream();
  const { mutate } = useSWRConfig();

  const chatIdFromUrl = extractChatId(pathname);
  const isNewChat = !chatIdFromUrl;
  const newChatIdRef = useRef(generateUUID());
  const pendingTask = useRef<{
    chatId: string;
    text: string;
    useWeb: boolean;
  } | null>(null);
  const prevPathnameRef = useRef(pathname);

  if (
    isNewChat &&
    prevPathnameRef.current !== pathname &&
    extractChatId(prevPathnameRef.current) !== null
  ) {
    newChatIdRef.current = pendingTask.current?.chatId ?? generateUUID();
  }
  prevPathnameRef.current = pathname;

  const chatId = chatIdFromUrl ?? newChatIdRef.current;
  const [capabilityDraft, setCapabilityDraft] = useState<{
    chatId: string;
    value: CapabilitySelection;
  } | null>(null);
  const capabilityDraftRef = useRef(capabilityDraft);
  capabilityDraftRef.current = capabilityDraft;
  const currentScopeChat = useRef(chatId);
  currentScopeChat.current = chatId;
  const capabilitySelection =
    capabilityDraft?.chatId === chatId ? capabilityDraft.value : undefined;
  const setCapabilitySelection = useCallback(
    (selection: CapabilitySelection) => {
      if (currentScopeChat.current !== chatId) {
        return;
      }
      const next = { chatId, value: selection };
      capabilityDraftRef.current = next;
      setCapabilityDraft(next);
    },
    [chatId]
  );

  const pendingHistory = useRef(new Map<string, ExpectedHistory>());
  const interactionGate = useRef({
    answerPending: false,
    chatId,
    expectedHistory: undefined as ExpectedHistory | undefined,
    historyChanged: false,
    manual: false,
    newUserTurn: false,
    paused: false,
    released: false,
    revision: 0,
    sentSignature: "",
  });
  if (interactionGate.current.chatId !== chatId) {
    interactionGate.current = {
      answerPending: false,
      chatId,
      expectedHistory: undefined,
      historyChanged: false,
      manual: false,
      newUserTurn: false,
      paused: false,
      released: false,
      revision: 0,
      sentSignature: "",
    };
  }
  const [searchMode, setSearchMode] = useState<"auto" | "web">("auto");
  const searchModeRef = useRef(searchMode);
  searchModeRef.current = searchMode;
  const lastSendFailure = useRef<Error | undefined>(undefined);
  const regenerationSnapshot = useRef<{
    chatId: string;
    messages: ChatMessage[];
  } | null>(null);

  const [liveTitle, setLiveTitle] = useState<{
    chatId: string;
    title: string;
  } | null>(null);
  const [currentModelId, setCurrentModelId] = useState("");
  const { data: modelCatalog } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    fetcher,
    { dedupingInterval: 3_600_000, revalidateOnFocus: false }
  );
  useEffect(() => {
    const ids: string[] | undefined = modelCatalog?.selectableModelIds;
    if (modelCatalog && !ids && !currentModelId) {
      setCurrentModelId(DEFAULT_CHAT_MODEL);
    }
    if (ids?.length && !ids.includes(currentModelId)) {
      setCurrentModelId(
        ids.includes(modelCatalog?.defaultModelId)
          ? modelCatalog.defaultModelId
          : ids[0]
      );
    }
  }, [modelCatalog, currentModelId]);
  const currentModelIdRef = useRef(currentModelId);
  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  const [input, setInput] = useChatDraft(
    `research:draft:${ownerId}:${isNewChat ? "new" : chatId}`,
    `${ownerId}:${chatId}`
  );
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [finishedHistoryWait, setFinishedHistoryWait] =
    useState<Chat<ChatMessage> | null>(null);
  const messagesKey = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/messages?chatId=${chatId}`;

  const {
    data: chatData,
    isLoading,
    error: loadError,
    mutate: reloadChat,
  } = useSWR<{
    isReadonly: boolean;
    messages: ChatMessage[];
    title?: string;
    visibility: VisibilityType;
  }>(isNewChat ? null : messagesKey, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: (failure) =>
      !(
        failure instanceof ChatbotError &&
        [401, 403].includes(failure.statusCode)
      ),
  });

  const expectedHistory = pendingHistory.current.get(chatId);
  const awaitingHistory =
    !isNewChat &&
    !loadError &&
    expectedHistory !== undefined &&
    !(chatData && historyContainsTurn(chatData.messages, expectedHistory));
  const initialMessages: ChatMessage[] =
    isNewChat || loadError || awaitingHistory ? [] : (chatData?.messages ?? []);
  const visibility: VisibilityType = isNewChat
    ? "private"
    : (chatData?.visibility ?? "private");

  const chatOptions: ChatInit<ChatMessage> & {
    transport: ChatTransport<ChatMessage>;
  } = {
    generateId: generateUUID,
    id: chatId,
    messages: initialMessages,
    onData: (dataPart) => {
      if (
        dataPart.type === "data-run-status" &&
        dataPart.data.state === "failed"
      ) {
        const gate = interactionGate.current;
        const userMessage = chatInstanceRef.current?.messages.findLast(
          ({ role }) => role === "user"
        );
        if (gate.newUserTurn && userMessage) {
          gate.expectedHistory = {
            id: userMessage.id,
            kind: "failure",
            until: Date.now() + PENDING_HISTORY_WAIT_MS,
          };
        }
      }
      if (dataPart.type === "data-chat-title") {
        setLiveTitle({ chatId, title: dataPart.data });
      }
      if (dataPart.type === "data-waiting-status") {
        setWaitingStatus(dataPart.data);
        return;
      }
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
    },
    onError: (streamError) => {
      if (
        streamError.message?.includes("AI Gateway requires a valid credit card")
      ) {
        setShowCreditCardAlert(true);
      }
      // ConversationNotice / the persisted assistant status owns stream errors.
      // Do not repeat the same failure as a toast or inject a continuation turn.
    },
    onFinish: ({
      isAbort,
      isError,
      isDisconnect,
      finishReason,
      message: finishedMessage,
      messages: finishedMessages,
    }) => {
      const failed =
        isAbort ||
        isError ||
        isDisconnect ||
        !isCompleteFinishReason(finishReason) ||
        (finishedMessage && hasRunFailure(finishedMessage));
      const stoppedByUser =
        isAbort && !isError && !isDisconnect && interactionGate.current.paused;
      // Only a new prompt is already stored when a partial reply arrives.
      // An interrupted edit still needs to restore the saved turn and draft.
      const stoppedAfterReply =
        stoppedByUser &&
        interactionGate.current.newUserTurn &&
        hasReplyContent(finishedMessage);
      lastSendFailure.current =
        failed && !stoppedAfterReply
          ? new Error("本轮未完成，草稿已保留。")
          : undefined;
      if (!failed) {
        // Revalidate without blanking the active snapshot. Clearing it here
        // can unmount the composer before its successful send clears the draft.
        interactionGate.current.historyChanged = true;
        mutate(messagesKey);
      }
      const snapshot = regenerationSnapshot.current;
      // useChat forwards old-instance callbacks through its latest callback refs.
      // The stored question UUID identifies the originating turn, not just the current URL.
      if (
        snapshot?.chatId === chatId &&
        finishedMessages.some(
          (item) =>
            item.role === "user" && item.id === snapshot.messages.at(-2)?.id
        )
      ) {
        if (failed) {
          setMessages(snapshot.messages);
        } else {
          const answerId = snapshot.messages.at(-1)?.id;
          mutate<Vote[]>(
            `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/vote?chatId=${chatId}`,
            (current) => current?.filter((item) => item.messageId !== answerId),
            { revalidate: false }
          );
        }
        regenerationSnapshot.current = null;
      }
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    sendAutomaticallyWhen: ({ messages: currentMessages }) => {
      const gate = interactionGate.current;
      return (
        gate.chatId === chatId &&
        !gate.manual &&
        !gate.released &&
        shouldContinueAgent(currentMessages, gate.paused, gate.sentSignature)
      );
    },
    transport: new DefaultChatTransport({
      api: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat`,
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        const lastMessage = request.messages.at(-1);
        const responses = compactInteractionResponses(request.messages);
        const isToolApprovalContinuation =
          lastMessage?.role === "assistant" && responses.length > 0;
        if (
          isToolApprovalContinuation &&
          interactionGate.current.chatId === request.id
        ) {
          interactionGate.current.sentSignature = interactionResponseSignature(
            request.messages
          );
        }

        return {
          body: {
            id: request.id,
            ...(isToolApprovalContinuation
              ? { messages: responses }
              : { message: lastMessage }),
            ...(!isToolApprovalContinuation &&
            capabilityDraftRef.current?.chatId === request.id
              ? { capabilitySelection: capabilityDraftRef.current.value }
              : {}),
            searchMode: searchModeRef.current,
            selectedChatModel: currentModelIdRef.current,
            selectedVisibilityType: visibility,
            trigger: request.trigger,
            ...request.body,
          },
        };
      },
    }),
  };

  const chatOptionsRef = useRef(chatOptions);
  chatOptionsRef.current = chatOptions;
  const chatInstanceRef = useRef<Chat<ChatMessage> | null>(null);
  if (chatInstanceRef.current?.id !== chatId) {
    // Isolate SDK instance callbacks, including A -> B -> A navigation.
    // The hook's default latest-ref wrappers otherwise deliver old callbacks to the new instance.
    const instance: Chat<ChatMessage> = new Chat({
      ...chatOptions,
      onData: (part) => {
        if (chatInstanceRef.current === instance) {
          chatOptionsRef.current.onData?.(part);
        }
      },
      onError: (streamError) => {
        if (chatInstanceRef.current === instance) {
          chatOptionsRef.current.onError?.(streamError);
        }
      },
      onFinish: (event) => {
        if (chatInstanceRef.current === instance) {
          chatOptionsRef.current.onFinish?.(event);
        }
      },
      sendAutomaticallyWhen: (event) =>
        chatInstanceRef.current === instance
          ? (chatOptionsRef.current.sendAutomaticallyWhen?.(event) ?? false)
          : false,
      transport: {
        reconnectToStream: (request) => {
          interactionGate.current.newUserTurn = false;
          return chatOptionsRef.current.transport.reconnectToStream(request);
        },
        sendMessages: async (request) => {
          interactionGate.current.expectedHistory = undefined;
          interactionGate.current.newUserTurn =
            request.trigger === "submit-message" &&
            !("trigger" in (request.body ?? {})) &&
            request.messages.at(-1)?.role === "user";
          const stream =
            await chatOptionsRef.current.transport.sendMessages(request);
          const metadata = request.metadata as
            | { onAccepted?: () => void }
            | undefined;
          if (
            chatInstanceRef.current === instance &&
            typeof metadata?.onAccepted === "function"
          ) {
            metadata.onAccepted();
          }
          return stream;
        },
      },
    });
    chatInstanceRef.current = instance;
  }
  const activeInstance = chatInstanceRef.current;
  const {
    messages,
    setMessages,
    sendMessage: sdkSendMessage,
    status,
    stop: sdkStop,
    regenerate,
    resumeStream,
    addToolApprovalResponse: sdkAddToolApprovalResponse,
    error,
    clearError,
  } = useChat<ChatMessage>({ chat: activeInstance });

  useEffect(() => {
    const gate = interactionGate.current;
    gate.released = false;
    return () => {
      // 生命周期清理必须中止此 effect 捕获的实例。导航 render 已切换 ref，
      // 面向旧按钮的 stop 门控会拒绝旧实例，因此清理不经过该交互入口。
      // 同时失效卸载后的处理器及等待中的回答，阻止其随后启动另一轮请求。
      if (gate.paused || gate.expectedHistory || gate.historyChanged) {
        if (gate.expectedHistory) {
          for (const [id, pending] of pendingHistory.current) {
            if (pending.until <= Date.now()) {
              pendingHistory.current.delete(id);
            }
          }
          pendingHistory.current.set(activeInstance.id, gate.expectedHistory);
        }
        // The old history subscription has left. Invalidate its snapshot and
        // in-flight GET without refetching a turn that may still be saving.
        mutate(messagesKey, undefined, { revalidate: true });
      }
      gate.released = true;
      gate.revision += 1;
      activeInstance.stop();
    };
  }, [activeInstance, messagesKey, mutate]);

  const stop = useCallback(async () => {
    const gate = interactionGate.current;
    if (
      gate.released ||
      gate.chatId !== chatId ||
      chatInstanceRef.current !== activeInstance
    ) {
      return;
    }
    gate.paused = true;
    gate.revision += 1;
    const last = activeInstance.messages.at(-1);
    if (
      activeInstance.status === "streaming" &&
      gate.newUserTurn &&
      last?.role === "assistant" &&
      hasReplyContent(last)
    ) {
      gate.expectedHistory = {
        id: last.id,
        kind: "reply",
        until: Date.now() + PENDING_HISTORY_WAIT_MS,
      };
    }
    await sdkStop();
  }, [activeInstance, chatId, sdkStop]);

  const sendMessage = useCallback<UseChatHelpers<ChatMessage>["sendMessage"]>(
    async (message, options) => {
      const gate = interactionGate.current;
      if (
        gate.released ||
        gate.chatId !== chatId ||
        chatInstanceRef.current !== activeInstance
      ) {
        return;
      }
      gate.paused = false;
      gate.revision += 1;
      await sdkSendMessage(message, options);
    },
    [activeInstance, chatId, sdkSendMessage]
  );

  const addToolApprovalResponse = useCallback<
    UseChatHelpers<ChatMessage>["addToolApprovalResponse"]
  >(
    async (response) => {
      const gate = interactionGate.current;
      if (
        gate.released ||
        chatInstanceRef.current !== activeInstance ||
        gate.chatId !== chatId
      ) {
        throw new Error("这条工具确认已过期。");
      }
      // 新的明确允许/拒绝是用户交互；解除暂停，但绝不替用户生成批准决定。
      gate.paused = false;
      await sdkAddToolApprovalResponse(response);
    },
    [activeInstance, chatId, sdkAddToolApprovalResponse]
  );

  const getSendError = useCallback(
    () => chatInstanceRef.current?.error ?? lastSendFailure.current,
    []
  );

  const regenerateAnswer = useCallback(async () => {
    if (
      status === "streaming" ||
      status === "submitted" ||
      messages.at(-1)?.role !== "assistant"
    ) {
      return;
    }
    const snapshot = { chatId, messages };
    regenerationSnapshot.current = snapshot;
    clearError();
    try {
      await regenerate();
    } catch {
      if (regenerationSnapshot.current === snapshot) {
        setMessages(snapshot.messages);
        regenerationSnapshot.current = null;
      }
    }
  }, [chatId, messages, status, clearError, regenerate, setMessages]);

  const startNewChat = useCallback(() => {
    if (chatInstanceRef.current !== activeInstance) {
      return;
    }
    pendingTask.current = null;
    // Navigating away releases this instance; it is not a user pause.
    const gate = interactionGate.current;
    gate.released = true;
    gate.revision += 1;
    sdkStop();
    clearError();
    setSearchMode("auto");
    newChatIdRef.current = generateUUID();
    if (isNewChat) {
      setMessages([]);
      setInput("");
    }
    try {
      sessionStorage.removeItem(`research:draft:${ownerId}:new`);
    } catch {
      // Storage can be disabled; opening a new chat still works.
    }
    refreshNewChat((revision) => revision + 1);
    router.push("/chat");
  }, [
    activeInstance,
    clearError,
    isNewChat,
    ownerId,
    router,
    sdkStop,
    setInput,
    setMessages,
  ]);
  const startTask = useCallback(
    (draft: TaskDraft, useWeb: boolean) => {
      const text = buildTaskMessage(draft);
      startNewChat();
      pendingTask.current = { chatId: newChatIdRef.current, text, useWeb };
    },
    [startNewChat]
  );
  const retryLoad = useCallback(() => {
    reloadChat();
  }, [reloadChat]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        startNewChat();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [startNewChat]);

  useEffect(() => {
    if (status === "submitted" || status === "ready" || status === "error") {
      setWaitingStatus(undefined);
    }
  }, [status, setWaitingStatus]);

  const hydratedInstance = useRef<Chat<ChatMessage> | null>(null);

  useEffect(() => {
    if (isNewChat) {
      hydratedInstance.current = activeInstance;
      return;
    }
    const history = chatData?.messages;
    if (!history || loadError || hydratedInstance.current === activeInstance) {
      return;
    }

    const hydrate = () => {
      if (chatInstanceRef.current !== activeInstance) {
        return;
      }
      pendingHistory.current.delete(chatId);
      hydratedInstance.current = activeInstance;
      setMessages(history);
    };
    const until = expectedHistory?.until ?? 0;
    const remaining = until - Date.now();
    if (
      !awaitingHistory ||
      finishedHistoryWait === activeInstance ||
      remaining <= 0
    ) {
      hydrate();
      return;
    }

    // The first GET can arrive before the finished stream saves its history.
    // Recheck only history, never replay the user's message or approval.
    let cancelled = false;
    let checking = false;
    let recheck: ReturnType<typeof setTimeout>;
    const deadline = setTimeout(() => {
      // Adopt the last in-flight response before exposing the older snapshot.
      if (!checking) {
        setFinishedHistoryWait(activeInstance);
      }
    }, remaining);
    const schedule = () => {
      recheck = setTimeout(async () => {
        if (
          cancelled ||
          chatInstanceRef.current !== activeInstance ||
          hydratedInstance.current === activeInstance
        ) {
          return;
        }
        if (Date.now() >= until) {
          setFinishedHistoryWait(activeInstance);
          return;
        }
        checking = true;
        await reloadChat().catch(() => undefined);
        checking = false;
        if (cancelled || chatInstanceRef.current !== activeInstance) {
          return;
        }
        if (Date.now() >= until) {
          // SWR mutate may return cached data even after a denied GET.
          // Let the render/effect inspect loadError before adopting history.
          setFinishedHistoryWait(activeInstance);
        } else {
          schedule();
        }
      }, PENDING_HISTORY_RECHECK_MS);
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(deadline);
      clearTimeout(recheck);
    };
  }, [
    activeInstance,
    awaitingHistory,
    chatData?.messages,
    chatId,
    finishedHistoryWait,
    isNewChat,
    loadError,
    reloadChat,
    setMessages,
    expectedHistory,
  ]);

  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      setSearchMode("auto");
      regenerationSnapshot.current = null;
      clearError();
      if (isNewChat) {
        setMessages([]);
      }
    }
  }, [chatId, isNewChat, setMessages, clearError]);

  useEffect(() => {
    const task = pendingTask.current;
    if (!isNewChat || task?.chatId !== chatId) {
      return;
    }
    pendingTask.current = null;
    searchModeRef.current = task.useWeb ? "web" : "auto";
    setSearchMode(searchModeRef.current);
    window.history.replaceState(
      {},
      "",
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
    );
    sendMessage({ parts: [{ text: task.text, type: "text" }], role: "user" });
  }, [chatId, isNewChat, sendMessage]);

  useEffect(() => {
    try {
      const cookieModel = document.cookie
        .split("; ")
        .find((row) => row.startsWith("chat-model="))
        ?.split("=")[1];
      if (cookieModel) {
        setCurrentModelId(decodeURIComponent(cookieModel));
      }
    } catch {
      // An invalid client cookie must not prevent opening a conversation.
    }
  }, []);

  const hasAppendedQueryRef = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("query");
    if (query && !hasAppendedQueryRef.current) {
      hasAppendedQueryRef.current = true;
      window.history.replaceState(
        {},
        "",
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
      );
      sendMessage({
        parts: [{ text: query, type: "text" }],
        role: "user" as const,
      });
    }
  }, [sendMessage, chatId]);

  useAutoResume({
    autoResume: !isNewChat && !!chatData && !loadError && !awaitingHistory,
    initialMessages,
    resumeStream,
    setMessages,
  });

  const isHistoryLoading = !isNewChat && (isLoading || awaitingHistory);
  const isReadonly =
    !isNewChat &&
    (isHistoryLoading || Boolean(loadError) || (chatData?.isReadonly ?? false));

  const answerAskUser = useCallback(
    async ({
      messageId,
      toolCallId,
      output,
    }: {
      messageId: string;
      toolCallId: string;
      output: AskUserOutput;
    }) => {
      const origin = activeInstance;
      const gate = interactionGate.current;
      if (
        !origin ||
        origin.id !== chatId ||
        chatInstanceRef.current !== origin ||
        gate.chatId !== chatId ||
        gate.released ||
        isReadonly ||
        origin.status === "streaming" ||
        origin.status === "submitted" ||
        gate.answerPending
      ) {
        throw new Error("当前提问暂不可提交。");
      }
      const latest = origin.messages.at(-1);
      const part = latest?.parts.find(
        (candidate) =>
          candidate.type === "tool-askUser" &&
          candidate.toolCallId === toolCallId
      );
      if (
        latest?.id !== messageId ||
        part?.type !== "tool-askUser" ||
        (part.state !== "input-available" && part.state !== "output-available")
      ) {
        throw new Error("这条提问已过期，请查看当前对话。");
      }
      const validated = validateAskUserOutput(part.input, output);
      const { revision } = gate;
      gate.answerPending = true;
      gate.manual = true;
      try {
        // SDK addToolOutput 只更新本地状态，不承诺自动网络请求完成。
        await origin.addToolOutput({
          output: validated,
          tool: "askUser",
          toolCallId,
        });
        if (
          chatInstanceRef.current !== origin ||
          interactionGate.current !== gate ||
          gate.revision !== revision
        ) {
          throw new Error("执行已停止或对话已切换。");
        }
        gate.manual = false;
        gate.paused = false;
        origin.clearError();
        // 即使本轮还有其它 Ask/审批，也显式提交当前答案，由服务端保存并决定是否等待。
        await origin.sendMessage();
        if (
          chatInstanceRef.current !== origin ||
          interactionGate.current !== gate ||
          gate.released
        ) {
          throw new Error("对话已切换。");
        }
        if (origin.error || gate.revision !== revision || gate.paused) {
          // Stop may resolve normally in the SDK. Confirm only this answer via
          // the owner-checked read API; never restart generation or replay tools.
          const response = await fetchWithErrorHandlers(
            `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/messages?chatId=${chatId}`,
            { signal: AbortSignal.timeout(5000) }
          );
          const saved = await response.json();
          if (
            !Array.isArray(saved.messages) ||
            !hasSavedAskResponse(
              saved.messages,
              messageId,
              toolCallId,
              validated
            )
          ) {
            throw new Error("回答保存尚未确认，请重试提交。");
          }
        }
      } finally {
        gate.manual = false;
        gate.answerPending = false;
      }
    },
    [activeInstance, chatId, isReadonly]
  );

  const reviseAskUser = useCallback(
    async ({
      messageId,
      toolCallId,
      output,
    }: {
      messageId: string;
      toolCallId: string;
      output: AskUserOutput;
    }) => {
      const origin = activeInstance;
      if (
        isReadonly ||
        interactionGate.current.released ||
        origin?.id !== chatId ||
        chatInstanceRef.current !== origin ||
        origin.status === "streaming" ||
        origin.status === "submitted"
      ) {
        throw new Error("当前暂不可修改回答。");
      }
      const message = origin.messages.find(
        (candidate) =>
          candidate.id === messageId && candidate.role === "assistant"
      );
      const part = message?.parts.find(
        (candidate) =>
          candidate.type === "tool-askUser" &&
          candidate.toolCallId === toolCallId
      );
      if (part?.type !== "tool-askUser" || part.state !== "output-available") {
        throw new Error("请先完成当前提问。");
      }
      const validated = validateAskUserOutput(part.input, output);
      if (validated.status !== "answered") {
        throw new Error("修改回答需要提供新的内容。");
      }
      const lines = part.input.questions.map((question) => {
        const answer = validated.answers[question.id];
        const values = Array.isArray(answer)
          ? answer
          : typeof answer === "string"
            ? [answer]
            : [];
        return `${question.label}：${values.map((answerValue) => question.options?.find((option) => option.value === answerValue)?.label ?? answerValue).join("、") || "未填写"}`;
      });
      // 修改是新的用户补充，不改写已提交工具结果，也不隐式授权任何工具。
      await sendMessage({
        parts: [
          {
            text: `对刚才的回答补充/修改：\n${part.input.title}\n${lines.join("\n")}\n请据此调整后续处理，保留已有执行记录，需要授权的工具仍须请求确认。`,
            type: "text",
          },
        ],
        role: "user",
      });
      if (origin.error) {
        throw origin.error;
      }
    },
    [activeInstance, chatId, isReadonly, sendMessage]
  );

  const taskSnapshot = useMemo(() => deriveTaskProgress(messages), [messages]);
  const taskProgress = taskSnapshot?.plan ?? null;
  const isTaskProgressRunning =
    (status === "submitted" || status === "streaming") &&
    messages.at(-1)?.id === taskSnapshot?.messageId;

  const { data: votes } = useSWR<Vote[]>(
    !isReadonly && messages.length >= 2
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/vote?chatId=${chatId}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const chatTitle = projectChatTitle({
    liveTitle: liveTitle?.chatId === chatId ? liveTitle.title : undefined,
    messages,
    persistedTitle: chatData?.title,
  });
  const value = useMemo<ActiveChatContextValue>(
    () => ({
      addToolApprovalResponse,
      answerAskUser,
      capabilitySelection,
      chatId,
      chatTitle,
      clearError,
      currentModelId,
      error,
      getSendError,
      input,
      isLoading: isHistoryLoading,
      isReadonly,
      isTaskProgressRunning,
      loadError,
      messages,
      regenerate,
      regenerateAnswer,
      retryLoad,
      reviseAskUser,
      searchMode,
      sendMessage,
      setCapabilitySelection,
      setCurrentModelId,
      setInput,
      setMessages,
      setSearchMode,
      setShowCreditCardAlert,
      showCreditCardAlert,
      startNewChat,
      startTask,
      status,
      stop,
      taskProgress,
      visibilityType: visibility,
      votes,
    }),
    [
      answerAskUser,
      capabilitySelection,
      setCapabilitySelection,
      reviseAskUser,
      taskProgress,
      isTaskProgressRunning,
      chatId,
      chatTitle,
      error,
      clearError,
      loadError,
      retryLoad,
      searchMode,
      regenerateAnswer,
      startNewChat,
      startTask,
      messages,
      setMessages,
      sendMessage,
      getSendError,
      status,
      stop,
      regenerate,
      addToolApprovalResponse,
      input,
      setInput,
      visibility,
      isReadonly,
      isHistoryLoading,
      votes,
      currentModelId,
      showCreditCardAlert,
    ]
  );

  return (
    <ActiveChatContext.Provider value={value}>
      {children}
    </ActiveChatContext.Provider>
  );
}

export function useActiveChat() {
  const context = useContext(ActiveChatContext);
  if (!context) {
    throw new Error("useActiveChat must be used within ActiveChatProvider");
  }
  return context;
}

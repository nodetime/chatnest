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
  hasPendingInteraction,
  interactionResponseSignature,
  shouldContinueAgent,
  type TodoPlan,
  validateAskUserOutput,
} from "@/server/domain/message/agent-interactions";
import {
  buildTaskMessage,
  type TaskDraft,
} from "@/server/domain/message/task-draft";
import { DEFAULT_CHAT_MODEL } from "@/server/domain/model/models";
import type { Vote } from "@/server/domain/vote/types";

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
  continueAgent: () => Promise<void>;
  agentPaused: boolean;
  taskProgress: TodoPlan | null;
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

  if (isNewChat && prevPathnameRef.current !== pathname) {
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

  const interactionGate = useRef({
    answerPending: false,
    chatId,
    manual: false,
    paused: false,
    released: false,
    revision: 0,
    sentSignature: "",
  });
  if (interactionGate.current.chatId !== chatId) {
    interactionGate.current = {
      answerPending: false,
      chatId,
      manual: false,
      paused: false,
      released: false,
      revision: 0,
      sentSignature: "",
    };
  }
  const [pausedChatId, setPausedChatId] = useState<string | null>(null);
  const agentPaused = pausedChatId === chatId;
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
    `research:draft:${ownerId}:${isNewChat ? "new" : chatId}`
  );
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);

  const {
    data: chatData,
    isLoading,
    error: loadError,
    mutate: reloadChat,
  } = useSWR(
    isNewChat
      ? null
      : `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/messages?chatId=${chatId}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const initialMessages: ChatMessage[] = isNewChat
    ? []
    : (chatData?.messages ?? []);
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
      messages: finishedMessages,
    }) => {
      lastSendFailure.current =
        isAbort ||
        isError ||
        isDisconnect ||
        !finishReason ||
        finishReason === "error"
          ? new Error("本轮未完成，草稿已保留。")
          : undefined;
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
        if (
          isAbort ||
          isError ||
          isDisconnect ||
          !finishReason ||
          finishReason === "error"
        ) {
          setMessages(snapshot.messages);
        } else {
          mutate(
            `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/messages?chatId=${chatId}`,
            (current: Record<string, unknown> | undefined) =>
              current ? { ...current, messages: finishedMessages } : current,
            { revalidate: false }
          );
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
        reconnectToStream: (request) =>
          chatOptionsRef.current.transport.reconnectToStream(request),
        sendMessages: (request) =>
          chatOptionsRef.current.transport.sendMessages(request),
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
      gate.released = true;
      gate.revision += 1;
      activeInstance.stop();
    };
  }, [activeInstance]);

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
    setPausedChatId(chatId);
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
      setPausedChatId(null);
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
      setPausedChatId(null);
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
    pendingTask.current = null;
    stop();
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
    router.push("/");
  }, [router, setMessages, stop, clearError, setInput, ownerId, isNewChat]);
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

  const hydratedChatId = useRef<string | null>(isNewChat ? chatId : null);

  useEffect(() => {
    if (isNewChat) {
      hydratedChatId.current = chatId;
      return;
    }
    if (chatData?.messages && hydratedChatId.current !== chatId) {
      hydratedChatId.current = chatId;
      setMessages(chatData.messages);
    }
  }, [chatId, chatData?.messages, setMessages, isNewChat]);

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
    autoResume: !isNewChat && !!chatData,
    initialMessages,
    resumeStream,
    setMessages,
  });

  const isReadonly = isNewChat
    ? false
    : isLoading || Boolean(loadError) || (chatData?.isReadonly ?? false);

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
        setPausedChatId(null);
        origin.clearError();
        // 即使本轮还有其它 Ask/审批，也显式提交当前答案，由服务端保存并决定是否等待。
        await origin.sendMessage();
        if (origin.error) {
          throw origin.error;
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

  const continueAgent = useCallback(async () => {
    const origin = activeInstance;
    if (
      isReadonly ||
      interactionGate.current.released ||
      origin?.id !== chatId ||
      chatInstanceRef.current !== origin ||
      origin.status === "streaming" ||
      origin.status === "submitted"
    ) {
      return;
    }
    if (hasPendingInteraction(origin.messages)) {
      throw new Error("请先回答或跳过提问，并完成待处理的工具确认。");
    }
    await sendMessage({
      parts: [
        {
          text: "请继续刚才未完成的任务。先核对已有工具结果与可能的副作用，不要盲目重放操作；自行判断下一步，需要信息时向我提问，需要授权的工具请重新请求确认。",
          type: "text",
        },
      ],
      role: "user",
    });
    if (origin.error) {
      throw origin.error;
    }
  }, [activeInstance, chatId, isReadonly, sendMessage]);
  const taskProgress = useMemo(() => deriveTaskProgress(messages), [messages]);

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
      agentPaused,
      answerAskUser,
      capabilitySelection,
      chatId,
      chatTitle,
      clearError,
      continueAgent,
      currentModelId,
      error,
      getSendError,
      input,
      isLoading: !isNewChat && isLoading,
      isReadonly,
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
      continueAgent,
      agentPaused,
      taskProgress,
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
      isNewChat,
      isLoading,
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

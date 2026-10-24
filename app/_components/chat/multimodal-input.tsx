"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  ArrowUpIcon,
  BrainIcon,
  EyeIcon,
  Globe,
  LockIcon,
  WrenchIcon,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { useWindowSize } from "usehooks-ts";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/app/_components/ai-elements/model-selector";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/app/_components/ai-elements/prompt-input";
import { ComposerMenu } from "@/app/_components/chat/composer-menu";
import { StopIcon } from "@/app/_components/chat/icons";
import { PreviewAttachment } from "@/app/_components/chat/preview-attachment";
import type { VisibilityType } from "@/app/_components/chat/visibility-selector";
import { Button } from "@/app/_components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/_components/ui/tooltip";
import { useActiveChat } from "@/app/_hooks/use-active-chat";
import { useAgentInfo } from "@/app/_hooks/use-agent-info";
import type { Attachment, ChatMessage } from "@/app/_lib/types";
import { cn, fetcher } from "@/app/_lib/utils";
import { MAX_MESSAGE_CHARACTERS } from "@/server/agent/input-limits";
import {
  type ChatModel,
  chatModels,
  DEFAULT_CHAT_MODEL,
  type ModelCapabilities,
} from "@/server/ai/models";
import {
  completeDraftSubmission,
  UploadAdmission,
} from "@/server/uploads/client-admission";
import {
  ATTACHMENT_ACCEPT,
  isImageMime,
  MAX_DOCUMENT_BYTES,
} from "@/server/uploads/document-types";

function setCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365;
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages: _messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType: _selectedVisibilityType,
  selectedModelId,
  onModelChange,
  editingMessage,
  onCancelEdit,
  isLoading: _isLoading,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage:
    | UseChatHelpers<ChatMessage>["sendMessage"]
    | (() => Promise<void>);
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  editingMessage?: ChatMessage | null;
  onCancelEdit?: () => void;
  isLoading?: boolean;
}) {
  const { data: agentInfo } = useAgentInfo();
  const { searchMode, setSearchMode, getSendError } = useActiveChat();
  const { data: modelsData } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    fetcher,
    { dedupingInterval: 3_600_000, revalidateOnFocus: false }
  );
  const vision =
    (modelsData?.capabilities ?? modelsData)?.[selectedModelId]?.vision ===
    true;
  const cancelSearch = useCallback(
    () => setSearchMode("auto"),
    [setSearchMode]
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const hasAutoFocused = useRef(false);
  useEffect(() => {
    if (!hasAutoFocused.current && width) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
        hasAutoFocused.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [width]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const admissionRef = useRef(new UploadAdmission(chatId));
  const admission = admissionRef.current;
  admission.switchChat(chatId);
  const liveChatId = useRef(chatId);
  liveChatId.current = chatId;
  const selectedRef = useRef(attachments);
  const submitting = useRef(false);
  const generationRef = useRef(0);
  const previousChatRef = useRef(chatId);
  if (previousChatRef.current !== chatId) {
    previousChatRef.current = chatId;
    generationRef.current += 1;
    submitting.current = false;
  }
  selectedRef.current = attachments;
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  useEffect(() => {
    if (liveChatId.current === chatId) {
      setUploadQueue([]);
    }
  }, [chatId]);
  useEffect(
    () => () => {
      admission.cancel();
      generationRef.current += 1;
    },
    [admission]
  );
  const handleInput = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value),
    [setInput]
  );

  const submitForm = useCallback(async () => {
    if (admission.pending || submitting.current) {
      toast.error("附件仍在上传、读取或发送，请稍候。");
      return;
    }
    if (attachments.length > 15) {
      toast.error("一条消息最多添加 15 个附件。");
      return;
    }
    if (attachments.some((a) => isImageMime(a.contentType)) && !vision) {
      toast.error("所选模型不支持图片，请选择支持视觉的模型；草稿已保留。");
      return;
    }
    if (
      attachments.some(
        (a) =>
          a.error ||
          (a.extraction &&
            !["ready", "truncated"].includes(a.extraction.status))
      )
    ) {
      toast.error("请先移除或重试未读取成功的附件；加密文件需上传解密副本。");
      return;
    }
    if (input.length > MAX_MESSAGE_CHARACTERS) {
      toast.error(
        `单条消息最多 ${MAX_MESSAGE_CHARACTERS.toLocaleString()} 字符，请拆分内容后发送。`
      );
      return;
    }
    if (editingMessage) {
      const editGeneration = generationRef.current;
      submitting.current = true;
      try {
        await (sendMessage as () => Promise<void>)();
      } finally {
        if (editGeneration === generationRef.current) {
          submitting.current = false;
        }
      }
      return;
    }
    const generation = generationRef.current;
    submitting.current = true;
    const sentUrls = new Set(attachments.map((a) => a.url));
    try {
      await completeDraftSubmission(
        () =>
          sendMessage({
            parts: [
              ...attachments.map((a) => ({
                filename: a.name,
                mediaType: a.contentType,
                type: "file" as const,
                url: a.url,
              })),
              ...(input.trim() ? [{ text: input, type: "text" as const }] : []),
            ],
            role: "user",
          }),
        getSendError,
        () => generation === generationRef.current,
        () => {
          setAttachments((current) =>
            current.filter((a) => !sentUrls.has(a.url))
          );
          setInput((current) => (current === input ? "" : current));
          window.history.pushState(
            {},
            "",
            `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
          );
        }
      );
    } catch {
      /* The chat hook displays the actionable server error. Keep the draft. */
    } finally {
      if (generation === generationRef.current) {
        submitting.current = false;
      }
    }
    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    admission,
    attachments,
    chatId,
    editingMessage,
    getSendError,
    input,
    sendMessage,
    setAttachments,
    setInput,
    vision,
    width,
  ]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (editingMessage) {
        toast.error("编辑消息仅修改文字；如需新附件，请取消编辑后发送新消息。");
        return;
      }
      if (!files.length) {
        return;
      }
      if (status !== "ready" && status !== "error") {
        toast.error("请等待当前回复完成后再添加附件。");
        return;
      }
      if (!agentInfo?.uploadsConfigured) {
        toast.error("附件上传尚未开启，请联系平台管理员配置文件存储。");
        return;
      }
      if (files.some((file) => file.type.startsWith("image/")) && !vision) {
        toast.error("所选模型不支持图片，请选择支持视觉的模型。");
        return;
      }
      if (
        files.some(
          (file) =>
            !file.size ||
            file.size >
              (file.type.startsWith("image/")
                ? 5 * 1024 * 1024
                : MAX_DOCUMENT_BYTES) ||
            !/\.(jpe?g|png|pdf|docx|xlsx|csv|txt)$/i.test(file.name)
        )
      ) {
        toast.error(
          "支持 JPEG/PNG（5 MiB）、PDF/DOCX/XLSX/CSV/TXT（64 MiB）。旧版 Office/宏文件请另存为普通格式。"
        );
        return;
      }
      const ticket = admission.admit(selectedRef.current.length, files.length);
      if (!ticket) {
        toast.error(
          admission.pending
            ? "附件仍在上传和读取，请稍候。"
            : "一条消息最多添加 15 个附件。"
        );
        return;
      }
      const uploadChat = chatId;
      setUploadQueue(files.map((file) => file.name));
      const uploaded: Attachment[] = [];
      try {
        // Sequential within each admitted batch also bounds browser/server decode pressure.
        for (const file of files) {
          if (!admission.isCurrent(ticket)) {
            break;
          }
          const form = new FormData();
          form.append("file", file);
          form.append("chatId", uploadChat);
          try {
            // biome-ignore lint/performance/noAwaitInLoops: Bounded sequential I/O prevents concurrent memory and transaction pressure.
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/files/upload`,
              { body: form, method: "POST", signal: ticket.controller.signal }
            );
            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.error ?? "附件上传或读取失败，请重试。");
            }
            const attachment = {
              contentType: data.contentType,
              extraction: data.extraction,
              name: data.name,
              retryFile: file,
              size: data.size,
              url: data.url,
            };
            if (!admission.isCurrent(ticket)) {
              fetch(data.url, { method: "DELETE" }).catch(() => undefined);
              break;
            }
            uploaded.push(attachment);
          } catch (error) {
            if (admission.isCurrent(ticket)) {
              uploaded.push({
                contentType: file.type,
                error:
                  error instanceof Error
                    ? error.message
                    : "附件上传失败，请重试。",
                name: file.name,
                retryFile: file,
                size: file.size,
                url: `failed:${crypto.randomUUID()}`,
              });
              toast.error(
                error instanceof Error
                  ? error.message
                  : "附件上传或读取失败，请重试。"
              );
            }
          }
        }
        if (admission.isCurrent(ticket)) {
          selectedRef.current = [...selectedRef.current, ...uploaded];
          setAttachments((current) => [...current, ...uploaded]);
        } else {
          for (const attachment of uploaded) {
            if (!attachment.error) {
              fetch(attachment.url, { method: "DELETE" }).catch(
                () => undefined
              );
            }
          }
        }
      } finally {
        if (admission.isCurrent(ticket)) {
          setUploadQueue([]);
        }
        admission.finish(ticket);
      }
    },
    [
      admission,
      agentInfo?.uploadsConfigured,
      chatId,
      editingMessage,
      setAttachments,
      status,
      vision,
    ]
  );
  const retryAttachment = useCallback(
    (attachment: Attachment) => {
      if (!attachment.retryFile || admission.pending) {
        return;
      }
      selectedRef.current = selectedRef.current.filter(
        (a) => a.url !== attachment.url
      );
      setAttachments((current) =>
        current.filter((a) => a.url !== attachment.url)
      );
      if (!attachment.error) {
        fetch(attachment.url, { method: "DELETE" }).catch(() => undefined);
      }
      uploadFiles([attachment.retryFile]);
    },
    [admission, setAttachments, uploadFiles]
  );
  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      uploadFiles(files);
    },
    [uploadFiles]
  );
  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []).filter(
        (item) => item.kind === "file"
      );
      if (!items.length) {
        return;
      }
      event.preventDefault();
      uploadFiles(
        items
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
      );
    },
    [uploadFiles]
  );
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const handleCancelEditMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      onCancelEdit?.();
    },
    [onCancelEdit]
  );

  const handlePromptSubmit = useCallback(() => {
    if (!input.trim() && attachments.length === 0) {
      return;
    }
    if (status === "ready" || status === "error") {
      submitForm();
    } else {
      toast.error("请等待当前回复完成，或点击停止。");
    }
  }, [attachments.length, input, status, submitForm]);

  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape" && editingMessage && onCancelEdit) {
        e.preventDefault();
        onCancelEdit();
      }
    },
    [editingMessage, onCancelEdit]
  );

  return (
    <div
      className={cn("relative flex w-full min-w-0 flex-col gap-2", className)}
    >
      {editingMessage && onCancelEdit ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>
            原图片保留，编辑时只修改文字；原文档附件同样保留 ·
            发送后会重新生成回复
          </span>
          <button
            className="rounded px-1.5 py-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
            onMouseDown={handleCancelEditMouseDown}
            type="button"
          >
            取消
          </button>
        </div>
      ) : null}

      <input
        accept={ATTACHMENT_ACCEPT}
        disabled={Boolean(editingMessage)}
        hidden
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />

      <PromptInput
        className="[&>div]:rounded-[10px] [&>div]:border [&>div]:border-border [&>div]:bg-card [&>div]:shadow-[var(--shadow-composer)] [&>div]:transition-shadow [&>div]:duration-200 [&>div]:ring-0! [&>div]:focus-within:border-ring! [&>div]:focus-within:outline-1 [&>div]:focus-within:outline-ring/30"
        onSubmit={handlePromptSubmit}
      >
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <PromptInputHeader
            className="flex w-full min-w-0 self-start flex-row flex-wrap gap-2 px-3 pt-3"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <AttachmentPreviewItem
                attachment={attachment}
                disabled={status === "streaming" || status === "submitted"}
                fileInputRef={fileInputRef}
                key={attachment.url}
                onRetry={retryAttachment}
                setAttachments={setAttachments}
              />
            ))}

            {uploadQueue.map((filename) => (
              <PreviewAttachment
                attachment={{
                  contentType: "",
                  name: filename,
                  url: "",
                }}
                isUploading={true}
                key={filename}
              />
            ))}
          </PromptInputHeader>
        )}
        <PromptInputBody>
          <PromptInputTextarea
            aria-label="消息输入框"
            className="min-h-[44px] text-[15px] leading-relaxed px-3 pt-3 pb-1 placeholder:text-muted-foreground"
            data-testid="multimodal-input"
            onChange={handleInput}
            onKeyDown={handleTextareaKeyDown}
            placeholder={editingMessage ? "修改消息…" : "描述你想完成的事…"}
            ref={textareaRef}
            value={input}
          />
        </PromptInputBody>
        <PromptInputFooter className="gap-1 px-2 pb-2">
          <PromptInputTools className="min-w-0 flex-wrap">
            <ModelSelectorCompact
              onModelChange={onModelChange}
              selectedModelId={selectedModelId}
            />
            <ComposerMenu
              busy={
                Boolean(editingMessage) ||
                status === "submitted" ||
                status === "streaming" ||
                uploadQueue.length > 0 ||
                attachments.some(
                  (a) =>
                    a.error ||
                    (a.extraction &&
                      !["ready", "truncated"].includes(a.extraction.status))
                )
              }
              fileInputRef={fileInputRef}
              selectedModelId={selectedModelId}
            />
            {searchMode === "web" && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs"
                data-testid="search-mode-chip"
              >
                <Globe className="size-3.5" />
                联网搜索
                <button
                  aria-label="取消联网搜索"
                  className="rounded-full p-0.5 hover:bg-background"
                  onClick={cancelSearch}
                  type="button"
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
          </PromptInputTools>

          {status === "submitted" || status === "streaming" ? (
            <StopButton setMessages={setMessages} stop={stop} />
          ) : (
            <PromptInputSubmit
              aria-label="发送消息"
              className={cn(
                "h-9 w-9 rounded-lg transition-all duration-200",
                input.trim() || attachments.length > 0
                  ? "bg-foreground text-background hover:opacity-85 active:scale-95"
                  : "bg-muted text-muted-foreground/25 cursor-not-allowed"
              )}
              data-testid="send-button"
              disabled={
                (!input.trim() && attachments.length === 0) ||
                uploadQueue.length > 0 ||
                attachments.some(
                  (a) =>
                    a.error ||
                    (a.extraction &&
                      !["ready", "truncated"].includes(a.extraction.status))
                )
              }
              status={status}
              variant="secondary"
            >
              <ArrowUpIcon className="size-4" />
            </PromptInputSubmit>
          )}
        </PromptInputFooter>
      </PromptInput>
      {input.length >= MAX_MESSAGE_CHARACTERS * 0.8 && (
        <p
          aria-live="polite"
          className={cn(
            "px-2 text-right text-xs",
            input.length > MAX_MESSAGE_CHARACTERS
              ? "text-destructive"
              : "text-muted-foreground"
          )}
        >
          {input.length.toLocaleString()} /{" "}
          {MAX_MESSAGE_CHARACTERS.toLocaleString()} 字符
          {input.length > MAX_MESSAGE_CHARACTERS ? " · 请拆分后发送" : ""}
        </p>
      )}
    </div>
  );
}

export const MultimodalInput = PureMultimodalInput;

function PureAttachmentPreviewItem({
  attachment,
  fileInputRef,
  setAttachments,
  disabled,
  onRetry,
}: {
  attachment: Attachment;
  onRetry?: (attachment: Attachment) => void;
  disabled?: boolean;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
}) {
  const handleRetry = useCallback(
    () => onRetry?.(attachment),
    [onRetry, attachment]
  );
  const handleRemove = useCallback(() => {
    setAttachments((currentAttachments) =>
      currentAttachments.filter((a) => a.url !== attachment.url)
    );
    if (!attachment.error) {
      fetch(attachment.url, { method: "DELETE" }).catch(() => undefined);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [attachment.url, attachment.error, fileInputRef, setAttachments]);

  return (
    <PreviewAttachment
      attachment={attachment}
      onRemove={disabled ? undefined : handleRemove}
      onRetry={disabled ? undefined : handleRetry}
    />
  );
}

const AttachmentPreviewItem = memo(PureAttachmentPreviewItem);

function ModelSelectorOption({
  capabilities,
  curated,
  model,
  onModelChange,
  selectedModelId,
  setOpen,
}: {
  capabilities: Record<string, ModelCapabilities> | undefined;
  curated: boolean;
  model: ChatModel;
  onModelChange?: (modelId: string) => void;
  selectedModelId: string;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const logoProvider = model.provider;
  const maybeWithTooltip = (icon: ReactNode, label: string) => {
    if (!curated) {
      return icon;
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{icon}</span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  };
  const handleSelect = useCallback(() => {
    if (!curated) {
      return;
    }
    onModelChange?.(model.id);
    setCookie("chat-model", model.id);
    setOpen(false);
    setTimeout(() => {
      document
        .querySelector<HTMLTextAreaElement>("[data-testid='multimodal-input']")
        ?.focus();
    }, 50);
  }, [curated, model.id, onModelChange, setOpen]);

  const option = (
    <ModelSelectorItem
      aria-disabled={!curated}
      className={cn(
        "flex w-full transition-colors",
        model.id === selectedModelId &&
          "border-b border-dashed border-foreground/50",
        curated
          ? "data-[selected=true]:bg-muted data-[selected=true]:text-foreground"
          : "cursor-not-allowed opacity-40 data-[selected=true]:bg-transparent data-[selected=true]:opacity-60 data-[selected=true]:ring-1 data-[selected=true]:ring-muted-foreground/30 data-[selected=true]:ring-inset"
      )}
      onSelect={handleSelect}
      value={model.id}
    >
      <ModelSelectorLogo provider={logoProvider} />
      <ModelSelectorName>{model.name}</ModelSelectorName>
      <div className="ml-auto flex items-center gap-2 text-foreground/70">
        {capabilities?.[model.id]?.tools
          ? maybeWithTooltip(
              <WrenchIcon className="size-3.5" />,
              "Supports tool use"
            )
          : null}
        {capabilities?.[model.id]?.vision
          ? maybeWithTooltip(<EyeIcon className="size-3.5" />, "支持图片")
          : null}
        {capabilities?.[model.id]?.reasoning
          ? maybeWithTooltip(<BrainIcon className="size-3.5" />, "支持推理")
          : null}
        {!curated && <LockIcon className="size-3 text-muted-foreground/50" />}
      </div>
    </ModelSelectorItem>
  );

  if (curated) {
    return option;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="w-full cursor-not-allowed">{option}</div>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        此模型尚未在服务端开放。
      </TooltipContent>
    </Tooltip>
  );
}

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: modelsData } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    fetcher,
    { dedupingInterval: 3_600_000, revalidateOnFocus: false }
  );

  const capabilities: Record<string, ModelCapabilities> | undefined =
    modelsData?.capabilities ?? modelsData;
  const dynamicModels: ChatModel[] | undefined = modelsData?.models;
  const activeModels = dynamicModels ?? chatModels;

  const selectedModel =
    activeModels.find((m: ChatModel) => m.id === selectedModelId) ??
    activeModels.find((m: ChatModel) => m.id === DEFAULT_CHAT_MODEL) ??
    activeModels[0];
  const { provider } = selectedModel;

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        <Button
          aria-label="选择模型"
          className="h-9 max-w-[190px] justify-between gap-2 rounded-md px-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          data-testid="model-selector"
          variant="ghost"
        >
          {provider ? <ModelSelectorLogo provider={provider} /> : null}
          <ModelSelectorName>{selectedModel.name}</ModelSelectorName>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent commandDefaultValue={selectedModel.id}>
        <ModelSelectorInput placeholder="搜索模型…" />
        <ModelSelectorList>
          {(() => {
            const curatedIds = new Set<string>(
              modelsData?.selectableModelIds ?? chatModels.map((m) => m.id)
            );
            const allModels = modelsData?.selectableModelIds
              ? activeModels
              : dynamicModels
                ? [
                    ...chatModels,
                    ...dynamicModels.filter((m) => !curatedIds.has(m.id)),
                  ]
                : chatModels;

            const grouped: Record<
              string,
              { model: ChatModel; curated: boolean }[]
            > = {};
            for (const model of allModels) {
              const key = curatedIds.has(model.id)
                ? "_available"
                : model.provider;
              if (!grouped[key]) {
                grouped[key] = [];
              }
              grouped[key].push({ curated: curatedIds.has(model.id), model });
            }

            const sortedKeys = Object.keys(grouped).sort((a, b) => {
              if (a === "_available") {
                return -1;
              }
              if (b === "_available") {
                return 1;
              }
              return a.localeCompare(b);
            });

            const providerNames: Record<string, string> = {
              alibaba: "Alibaba",
              anthropic: "Anthropic",
              "arcee-ai": "Arcee AI",
              bytedance: "ByteDance",
              cohere: "Cohere",
              deepseek: "DeepSeek",
              google: "Google",
              inception: "Inception",
              kwaipilot: "Kwaipilot",
              meituan: "Meituan",
              meta: "Meta",
              minimax: "MiniMax",
              mistral: "Mistral",
              moonshotai: "Moonshot",
              morph: "Morph",
              nvidia: "Nvidia",
              openai: "OpenAI",
              perplexity: "Perplexity",
              "prime-intellect": "Prime Intellect",
              xai: "xAI",
              xiaomi: "Xiaomi",
              zai: "Zai",
            };

            return sortedKeys.map((key) => (
              <ModelSelectorGroup
                heading={
                  key === "_available"
                    ? "可选模型"
                    : (providerNames[key] ?? key)
                }
                key={key}
              >
                {grouped[key].map(({ model, curated }) => (
                  <ModelSelectorOption
                    capabilities={capabilities}
                    curated={curated}
                    key={model.id}
                    model={model}
                    onModelChange={onModelChange}
                    selectedModelId={selectedModel.id}
                    setOpen={setOpen}
                  />
                ))}
              </ModelSelectorGroup>
            ));
          })()}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

export const ModelSelectorCompact = memo(PureModelSelectorCompact);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      stop();
      setMessages((messages) => messages);
    },
    [setMessages, stop]
  );

  return (
    <Button
      aria-label="停止生成"
      className="h-9 w-9 rounded-full bg-foreground p-1 text-background transition-all duration-200 hover:opacity-85 active:scale-95 disabled:bg-muted disabled:text-muted-foreground/25 disabled:cursor-not-allowed"
      data-testid="stop-button"
      onClick={handleClick}
      type="button"
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);

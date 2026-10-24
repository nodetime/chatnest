"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import {
  MessageContent,
  MessageResponse,
} from "@/app/_components/ai-elements/message";
import { Shimmer } from "@/app/_components/ai-elements/shimmer";
import type { ToolPart } from "@/app/_components/ai-elements/tool";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/app/_components/ai-elements/tool";
import { ActivityGroup } from "@/app/_components/chat/activity-group";
import { groupActivityParts } from "@/app/_components/chat/activity-groups";
import { useDataStream } from "@/app/_components/chat/data-stream-provider";
import { DocumentToolResult } from "@/app/_components/chat/document";
import { DocumentPreview } from "@/app/_components/chat/document-preview";
import { MessageActions } from "@/app/_components/chat/message-actions";
import { MessageReasoning } from "@/app/_components/chat/message-reasoning";
import { PreviewAttachment } from "@/app/_components/chat/preview-attachment";
import { ToolActivity } from "@/app/_components/chat/tool-activity";
import { Weather } from "@/app/_components/chat/weather";
import type { ChatMessage } from "@/app/_lib/types";
import { cn, sanitizeText } from "@/app/_lib/utils";
import type { Vote } from "@/lib/db/schema";

function WaitingText() {
  const { waitingStatus } = useDataStream();
  const waitingText = waitingStatus?.message ?? "正在准备…";

  return (
    <div
      className="flex min-h-[calc(13px*1.65)] min-w-0 items-center text-[15px] leading-[1.75]"
      role="status"
    >
      <Shimmer
        as="span"
        className="font-medium whitespace-normal break-words"
        duration={1}
      >
        {waitingText}
      </Shimmer>
    </div>
  );
}

const PurePreviewMessage = ({
  addToolApprovalResponse,
  chatId,
  message,
  vote,
  isLoading,
  setMessages: _setMessages,
  regenerate: _regenerate,
  isReadonly,
  canApprove = true,
  requiresScrollPadding: _requiresScrollPadding,
  onEdit,
  onRegenerate,
  hideActivities = false,
  showSender = true,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  canApprove?: boolean;
  requiresScrollPadding: boolean;
  onEdit?: (message: ChatMessage) => void;
  onRegenerate?: () => void;
  hideActivities?: boolean;
  showSender?: boolean;
}) => {
  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );

  useDataStream();

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const hasAnyContent = message.parts?.some(
    (part) =>
      (part.type === "text" && part.text?.trim().length > 0) ||
      (part.type === "reasoning" &&
        "text" in part &&
        part.text?.trim().length > 0) ||
      part.type.startsWith("tool-") ||
      part.type === "dynamic-tool" ||
      part.type === "source-url" ||
      part.type === "file"
  );
  const isThinking = isAssistant && isLoading && !hasAnyContent;
  const isEmptyAssistant = isAssistant && !isLoading && !hasAnyContent;

  const attachments = attachmentsFromMessage.length > 0 && (
    <div
      className="flex min-w-0 max-w-full flex-row flex-wrap justify-end gap-2"
      data-testid={"message-attachments"}
    >
      {attachmentsFromMessage.map((attachment) => (
        <PreviewAttachment
          attachment={{
            contentType: attachment.mediaType,
            name: attachment.filename ?? "file",
            url: attachment.url,
          }}
          compact
          key={attachment.url}
        />
      ))}
    </div>
  );

  const renderPart = (part: ChatMessage["parts"][number], index: number) => {
    const { type } = part;
    const key = `message-${message.id}-part-${index}`;

    if (type === "reasoning") {
      return part.text?.trim().length > 0 ? (
        <MessageReasoning
          isLoading={isLoading || part.state === "streaming"}
          key={key}
          reasoning={part.text}
        />
      ) : null;
    }

    if (type === "text") {
      return (
        <MessageContent
          className={cn("text-[15px] leading-[1.75]", {
            "w-fit max-w-[min(85%,60ch)] overflow-hidden break-words rounded-2xl bg-secondary px-4 py-2.5":
              message.role === "user",
          })}
          data-testid="message-content"
          key={key}
        >
          <MessageResponse mode={isUser ? "static" : "streaming"}>
            {sanitizeText(part.text)}
          </MessageResponse>
        </MessageContent>
      );
    }

    if (type === "tool-getWeather") {
      const { toolCallId, state } = part;
      return state === "output-available" ? (
        <div className="w-[min(100%,450px)]" key={toolCallId}>
          <Weather weatherAtLocation={part.output} />
        </div>
      ) : (
        <ToolActivity
          approve={addToolApprovalResponse}
          canApprove={canApprove}
          isReadonly={isReadonly}
          isRunning={isLoading}
          key={toolCallId}
          part={part}
        />
      );
    }

    if (type === "tool-createResultTable") {
      if (!part.output || "error" in part.output) {
        return (
          <ToolActivity
            approve={addToolApprovalResponse}
            canApprove={canApprove}
            isReadonly={isReadonly}
            isRunning={isLoading}
            key={part.toolCallId}
            part={part}
          />
        );
      }
      return (
        <DocumentPreview
          isReadonly={isReadonly}
          key={part.toolCallId}
          result={part.output}
        />
      );
    }

    if (type === "tool-createDocument") {
      const { toolCallId } = part;

      if (part.output && "error" in part.output) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
            key={toolCallId}
          >
            Error creating document: {String(part.output.error)}
          </div>
        );
      }

      return (
        <DocumentPreview
          isReadonly={isReadonly}
          key={toolCallId}
          result={part.output}
        />
      );
    }

    if (type === "tool-updateDocument") {
      const { toolCallId } = part;

      if (part.output && "error" in part.output) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
            key={toolCallId}
          >
            Error updating document: {String(part.output.error)}
          </div>
        );
      }

      return (
        <div className="relative" key={toolCallId}>
          <DocumentPreview
            args={{ ...part.output, isUpdate: true }}
            isReadonly={isReadonly}
            result={part.output}
          />
        </div>
      );
    }

    if (type === "tool-requestSuggestions") {
      const { toolCallId, state } = part;

      return (
        <Tool
          className="w-[min(100%,450px)]"
          defaultOpen={true}
          key={toolCallId}
        >
          <ToolHeader state={state} type="tool-requestSuggestions" />
          <ToolContent>
            {state === "input-available" && <ToolInput input={part.input} />}
            {state === "output-available" && (
              <ToolOutput
                errorText={undefined}
                output={
                  "error" in part.output ? (
                    <div className="rounded border p-2 text-red-500">
                      Error: {String(part.output.error)}
                    </div>
                  ) : (
                    <DocumentToolResult
                      isReadonly={isReadonly}
                      result={part.output}
                      type="request-suggestions"
                    />
                  )
                }
              />
            )}
          </ToolContent>
        </Tool>
      );
    }

    if (type === "source-url") {
      try {
        const url = new URL(part.url);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        ) {
          return null;
        }
        return (
          <a
            className="w-fit rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
            href={url.href}
            key={key}
            rel="noopener noreferrer"
            target="_blank"
          >
            {part.title ?? url.hostname}
          </a>
        );
      } catch {
        return null;
      }
    }
    if (type === "dynamic-tool" || type.startsWith("tool-")) {
      return (
        <ToolActivity
          approve={addToolApprovalResponse}
          canApprove={canApprove}
          isReadonly={isReadonly}
          isRunning={isLoading}
          key={key}
          part={part as unknown as ToolPart}
        />
      );
    }
    return null;
  };
  const groupedParts = groupActivityParts(message.parts);
  const parts = groupedParts.map((group) =>
    group.kind === "activity" ? (
      hideActivities ? null : (
        <ActivityGroup
          approve={addToolApprovalResponse}
          canApprove={canApprove}
          isReadonly={isReadonly}
          isRunning={isLoading}
          key={group.key}
          parts={group.parts}
        />
      )
    ) : (
      renderPart(group.part, group.index)
    )
  );

  const toolOnlyAssistant =
    isAssistant &&
    groupedParts.length > 0 &&
    groupedParts.every((group) => group.kind === "activity");
  const actions = !isReadonly &&
    !isEmptyAssistant &&
    (!toolOnlyAssistant || onRegenerate) && (
      <MessageActions
        chatId={chatId}
        isLoading={isLoading}
        key={`action-${message.id}`}
        message={message}
        onEdit={onEdit ? () => onEdit(message) : undefined}
        onRegenerate={onRegenerate}
        vote={vote}
      />
    );

  const content = isThinking ? (
    <WaitingText />
  ) : (
    <>
      {attachments}
      {parts}
      {actions}
    </>
  );

  return (
    <div
      className={cn(
        "group/message w-full",
        !isAssistant && "animate-[fade-up_0.25s_cubic-bezier(0.22,1,0.36,1)]"
      )}
      data-role={message.role}
      data-testid={`message-${message.role}`}
      hidden={isEmptyAssistant}
    >
      <div
        className={cn(
          isUser ? "flex flex-col items-end gap-2" : "flex items-start gap-3"
        )}
      >
        {isAssistant ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {!!showSender && !isEmptyAssistant && <SenderLabel />}
            {content}
          </div>
        ) : (
          content
        )}
      </div>
    </div>
  );
};

export const PreviewMessage = PurePreviewMessage;

function SenderLabel() {
  return (
    <div
      className="mb-1 text-xs font-medium text-muted-foreground"
      data-testid="assistant-sender"
    >
      ChatNest
    </div>
  );
}

export const ThinkingMessage = () => (
  <div
    className="group/message w-full"
    data-role="assistant"
    data-testid="message-assistant-loading"
  >
    <div className="flex min-w-0 flex-col gap-2">
      <SenderLabel />
      <WaitingText />
    </div>
  </div>
);

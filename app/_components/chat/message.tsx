"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { ChatMessage } from "@/app/_lib/types";
import { cn, sanitizeText } from "@/app/_lib/utils";
import type { AskUserPart } from "@/server/domain/message/agent-interactions";
import { hasRunFailure } from "@/server/domain/message/run-failure";
import type { Vote } from "@/server/domain/vote/types";
import { MessageContent, MessageResponse } from "../ai-elements/message";
import { Shimmer } from "../ai-elements/shimmer";
import type { ToolPart } from "../ai-elements/tool";
import { ActivityGroup } from "./activity-group";
import { groupActivityParts } from "./activity-groups";
import { type AnswerAskUser, AskUser } from "./ask-user";
import { useDataStream } from "./data-stream-provider";
import { DocumentPreview } from "./document-preview";
import { MessageActions } from "./message-actions";
import { MessageReasoning } from "./message-reasoning";
import { PreviewAttachment } from "./preview-attachment";
import { ToolActivity } from "./tool-activity";
import { Weather } from "./weather";

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
  answerAskUser,
  reviseAskUser,
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
  hideRunFailure = false,
  showSender: _showSender = true,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  answerAskUser?: AnswerAskUser;
  reviseAskUser?: AnswerAskUser;
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
  hideRunFailure?: boolean;
  showSender?: boolean;
}) => {
  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );

  useDataStream();

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const groupedParts = groupActivityParts(message.parts);
  const hasAnyContent = groupedParts.some((group) => {
    if (group.kind === "activity") {
      return true;
    }
    const { part } = group;
    return (
      (part.type === "text" && part.text?.trim().length > 0) ||
      (part.type === "reasoning" && part.text?.trim().length > 0) ||
      part.type.startsWith("tool-") ||
      part.type === "dynamic-tool" ||
      part.type === "source-url" ||
      part.type === "file"
    );
  });
  const failedRun = !hideRunFailure && hasRunFailure(message);
  const isThinking = isAssistant && isLoading && !hasAnyContent && !failedRun;
  const isEmptyAssistant =
    isAssistant && !isLoading && !hasAnyContent && !failedRun;

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

    if (type === "tool-askUser") {
      return (
        <AskUser
          canAnswer={canApprove}
          isReadonly={isReadonly || !answerAskUser}
          isRunning={isLoading}
          key={part.toolCallId}
          messageId={message.id}
          onAnswer={
            answerAskUser ??
            (() =>
              Promise.reject(new Error("当前视图只读，请回到原对话回答。")))
          }
          onRevise={reviseAskUser}
          part={part as AskUserPart}
        />
      );
    }

    if (type === "reasoning") {
      return part.text?.trim().length > 0 ? (
        <MessageReasoning
          isLoading={isLoading || part.state === "streaming"}
          key={key}
          reasoning={part.text}
        />
      ) : null;
    }

    if (
      type === "data-run-status" &&
      isAssistant &&
      !isLoading &&
      !hideRunFailure &&
      part.data?.state === "failed"
    ) {
      return (
        <p
          className="text-[13px] leading-5 text-muted-foreground"
          data-testid="run-failure"
          key={key}
          role="status"
        >
          响应中断
        </p>
      );
    }

    if (type === "text") {
      return (
        <MessageContent
          className={cn("text-[15px] leading-[1.75]", {
            "w-fit max-w-[min(90%,64ch)] overflow-hidden break-words rounded-[14px] bg-secondary px-4 py-3":
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

    if (
      type === "tool-createDocument" ||
      type === "tool-updateDocument" ||
      type === "tool-requestSuggestions"
    ) {
      if (
        part.state === "output-available" &&
        part.output &&
        !("error" in part.output) &&
        "id" in part.output &&
        part.output.id
      ) {
        return (
          <DocumentPreview
            isReadonly={isReadonly}
            key={part.toolCallId}
            result={part.output}
          />
        );
      }
      return (
        <ToolActivity
          approve={addToolApprovalResponse}
          canApprove={canApprove}
          isReadonly={isReadonly}
          isRunning={isLoading}
          key={part.toolCallId}
          part={part as ToolPart}
        />
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
    groupedParts.every(
      (group) =>
        group.kind === "activity" || group.part.type === "data-run-status"
    );
  const actions = hasAnyContent &&
    !isReadonly &&
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
          <div className="flex min-w-0 flex-1 flex-col gap-2">{content}</div>
        ) : (
          content
        )}
      </div>
    </div>
  );
};

export const PreviewMessage = PurePreviewMessage;

export const ThinkingMessage = () => (
  <div
    className="group/message w-full"
    data-role="assistant"
    data-testid="message-assistant-loading"
  >
    <div className="flex min-w-0 flex-col gap-2">
      <WaitingText />
    </div>
  </div>
);

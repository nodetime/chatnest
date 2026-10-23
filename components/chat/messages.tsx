import type { UseChatHelpers } from "@ai-sdk/react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { prepareRegeneration } from "@/lib/agent/message-turn";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { useDataStream } from "./data-stream-provider";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";

type MessagesProps = {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  isLoading?: boolean;
  selectedModelId: string;
  onEditMessage?: (message: ChatMessage) => void;
  onRegenerateAnswer?: () => void;
};

function PureMessages({
  addToolApprovalResponse,
  chatId,
  status,
  votes,
  messages,
  setMessages,
  regenerate,
  isReadonly,
  isArtifactVisible: _isArtifactVisible,
  isLoading,
  selectedModelId: _selectedModelId,
  onEditMessage,
  onRegenerateAnswer,
}: MessagesProps) {
  useDataStream();

  // Approval continuations are active while the SDK submits the next request,
  // before streaming begins. Keep this scoped to the latest message.
  const isActive = status === "submitted" || status === "streaming";

  const renderMessage = (message: ChatMessage, index: number) => (
    <PreviewMessage
      addToolApprovalResponse={addToolApprovalResponse}
      chatId={chatId}
      isLoading={isActive && messages.length - 1 === index}
      isReadonly={isReadonly}
      key={message.id}
      message={message}
      onEdit={onEditMessage}
      onRegenerate={
        index === messages.length - 1 &&
        status !== "submitted" &&
        status !== "streaming" &&
        prepareRegeneration(messages, messages.at(-2)?.id ?? "")
          ? onRegenerateAnswer
          : undefined
      }
      regenerate={regenerate}
      requiresScrollPadding={false}
      setMessages={setMessages}
      vote={
        votes ? votes.find((vote) => vote.messageId === message.id) : undefined
      }
    />
  );

  return (
    <div className="relative flex-1 bg-background">
      {messages.length === 0 && !isLoading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <Greeting />
        </div>
      )}
      <Conversation className="absolute inset-0 min-h-0" key={chatId}>
        <ConversationContent className="mx-auto min-h-full w-full min-w-0 max-w-[800px] gap-5 px-5 py-8 sm:px-8 md:gap-7">
          {/* A canonical message always owns its tool subtree. Appending answer
              text must not reparent an open details dialog or its focus target. */}
          {messages.map(renderMessage)}

          {status === "submitted" && messages.at(-1)?.role !== "assistant" && (
            <ThinkingMessage />
          )}

          <div className="h-6 shrink-0" />
        </ConversationContent>
        <ConversationScrollButton
          aria-label="滚动到底部"
          className="z-10 size-9 shadow-sm"
        />
      </Conversation>
    </div>
  );
}

export const Messages = PureMessages;

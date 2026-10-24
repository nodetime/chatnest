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
import { RuntimeRecovery } from "./runtime-recovery";

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
  sendMessage?: UseChatHelpers<ChatMessage>["sendMessage"];
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
  sendMessage,
}: MessagesProps) {
  useDataStream();

  // Approval continuations are active while the SDK submits the next request,
  // before streaming begins. Keep this scoped to the latest message.
  const isActive = status === "submitted" || status === "streaming";
  const latestMessage = messages.at(-1);

  const renderMessage = (message: ChatMessage, index: number) => (
    <PreviewMessage
      addToolApprovalResponse={addToolApprovalResponse}
      canApprove={!isReadonly && !isActive && index === messages.length - 1}
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
      showSender={index === 0 || messages[index - 1]?.role !== "assistant"}
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
        <ConversationContent className="mx-auto min-h-full w-full min-w-0 max-w-[720px] gap-5 px-4 py-6 sm:px-6 md:gap-6">
          {/* A canonical message always owns its tool subtree. Appending answer
              text must not reparent an open details dialog or its focus target. */}
          {messages.map(renderMessage)}
          {sendMessage && latestMessage?.role === "assistant" && (
            <RuntimeRecovery
              isLatest
              isReadonly={isReadonly}
              key={`${chatId}:${latestMessage.id}:recovery`}
              message={latestMessage}
              sendMessage={sendMessage}
              status={status}
            />
          )}

          {status === "submitted" && messages.at(-1)?.role !== "assistant" && (
            <ThinkingMessage />
          )}

          <div className="h-2 shrink-0" />
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

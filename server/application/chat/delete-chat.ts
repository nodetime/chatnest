import type { ChatRepository } from "@/server/domain/chat/repository";
import { canAccessChat } from "@/server/domain/chat/types";
import { ChatbotError } from "@/server/shared/errors";

// 删除会话用例:属主校验是领域规则,级联清理由仓储实现承担
export type DeleteChatDeps = { chats: ChatRepository };

export async function deleteChat(
  { id, userId }: { id: string; userId: string },
  deps: DeleteChatDeps
) {
  const { chats } = deps;
  const chat = await chats.findById(id);
  if (!canAccessChat(chat, userId)) {
    // 会话缺失与属主不匹配同样拒绝,与原路由行为一致
    throw new ChatbotError("forbidden:chat");
  }
  return chats.deleteById(id);
}

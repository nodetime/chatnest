import { and, eq } from "drizzle-orm";
import type { VoteRepository } from "@/server/domain/vote/repository";
import { ChatbotError } from "@/server/shared/errors";
import { db } from "./client";
import { vote } from "./schema";

// P3:SQL 自 queries.ts 原样下沉,行为零漂移
export const voteRepository: VoteRepository = {
  listByChatId(chatId) {
    return db
      .select()
      .from(vote)
      .where(eq(vote.chatId, chatId))
      .catch((error: unknown) => {
        throw new ChatbotError("bad_request:database", { cause: error });
      });
  },
  async upsert({ chatId, messageId, type }) {
    try {
      const [existingVote] = await db
        .select()
        .from(vote)
        .where(and(eq(vote.messageId, messageId)));

      if (existingVote) {
        return await db
          .update(vote)
          .set({ isUpvoted: type === "up" })
          .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
      }
      return await db.insert(vote).values({
        chatId,
        isUpvoted: type === "up",
        messageId,
      });
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },
};

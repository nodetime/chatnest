import { and, desc, eq, gt, ilike, inArray, lt, type SQL } from "drizzle-orm";
import type { ChatRepository } from "@/server/domain/chat/repository";
import { ChatbotError } from "@/server/shared/errors";
import { cleanupDeletedChatAssets } from "@/server/uploads/service";
import { db } from "./client";
import { chat, message, stream, vote } from "./schema";

// P3:SQL 自 queries.ts 原样下沉,行为零漂移
export const chatRepository: ChatRepository = {
  async createStreamId(chatId, streamId) {
    try {
      await db
        .insert(stream)
        .values({ chatId, createdAt: new Date(), id: streamId });
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async deleteAllByUserId(userId) {
    try {
      const userChats = await db
        .select({ id: chat.id })
        .from(chat)
        .where(eq(chat.userId, userId));

      if (userChats.length === 0) {
        return { deletedCount: 0 };
      }

      const chatIds = userChats.map((c) => c.id);

      await db.delete(vote).where(inArray(vote.chatId, chatIds));
      await db.delete(message).where(inArray(message.chatId, chatIds));
      await db.delete(stream).where(inArray(stream.chatId, chatIds));

      const deletedChats = await db
        .delete(chat)
        .where(eq(chat.userId, userId))
        .returning();

      await Promise.all(
        chatIds.map((id) => cleanupDeletedChatAssets(id).catch(() => undefined))
      );
      return { deletedCount: deletedChats.length };
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async deleteById(id) {
    try {
      await db.delete(vote).where(eq(vote.chatId, id));
      await db.delete(message).where(eq(message.chatId, id));
      await db.delete(stream).where(eq(stream.chatId, id));

      const [chatsDeleted] = await db
        .delete(chat)
        .where(eq(chat.id, id))
        .returning();
      await cleanupDeletedChatAssets(id).catch(() => undefined);
      return chatsDeleted;
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async findById(id) {
    try {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, id));
      if (!selectedChat) {
        return null;
      }

      return selectedChat;
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async listByUser({ id, limit, startingAfter, endingBefore, search = "" }) {
    try {
      const extendedLimit = limit + 1;

      const query = (whereCondition?: SQL<unknown>) =>
        db
          .select()
          .from(chat)
          .where(
            and(
              eq(chat.userId, id),
              whereCondition,
              search
                ? ilike(chat.title, `%${search.replace(/[\\%_]/g, "\\$&")}%`)
                : undefined
            )
          )
          .orderBy(desc(chat.createdAt))
          .limit(extendedLimit);

      let filteredChats: (typeof chat.$inferSelect)[] = [];

      if (startingAfter) {
        const [selectedChat] = await db
          .select()
          .from(chat)
          .where(and(eq(chat.id, startingAfter), eq(chat.userId, id)))
          .limit(1);

        if (!selectedChat) {
          throw new ChatbotError(
            "not_found:database",
            `Chat with id ${startingAfter} not found`
          );
        }

        filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
      } else if (endingBefore) {
        const [selectedChat] = await db
          .select()
          .from(chat)
          .where(and(eq(chat.id, endingBefore), eq(chat.userId, id)))
          .limit(1);

        if (!selectedChat) {
          throw new ChatbotError(
            "not_found:database",
            `Chat with id ${endingBefore} not found`
          );
        }

        filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
      } else {
        filteredChats = await query();
      }

      const hasMore = filteredChats.length > limit;

      return {
        chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
        hasMore,
      };
    } catch (error) {
      if (error instanceof ChatbotError) {
        throw error;
      }
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async save({ id, userId, title, visibility }) {
    try {
      return await db.insert(chat).values({
        createdAt: new Date(),
        id,
        title,
        userId,
        visibility,
      });
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async updateTitle(chatId, title) {
    try {
      const updated = await db
        .update(chat)
        .set({ title })
        .where(eq(chat.id, chatId))
        .returning({ id: chat.id });
      return updated.length === 1;
    } catch {
      // Best effort title update.
      return false;
    }
  },

  async updateVisibility(chatId, visibility) {
    try {
      const updated = await db
        .update(chat)
        .set({ visibility })
        .where(eq(chat.id, chatId))
        .returning({ id: chat.id });
      return updated.length === 1;
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },
};

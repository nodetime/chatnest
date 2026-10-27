import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import {
  applyAskUserResponses,
  sameInteractionValue,
} from "@/server/domain/message/agent-interactions";
import { applyToolApprovals } from "@/server/domain/message/approvals";
import { convertToUIMessages } from "@/server/domain/message/convert";
import {
  prepareMessageEdit,
  prepareRegeneration,
} from "@/server/domain/message/message-turn";
import type { MessageRepository } from "@/server/domain/message/repository";
import type { ChatMessage } from "@/server/domain/message/types";
import { ChatbotError } from "@/server/shared/errors";
import { db } from "./client";
import { chat, message, vote } from "./schema";

// P3:SQL 自 queries.ts 原样下沉,行为零漂移;drizzle 行/插入值经仓储边界集中结构透传

export const messageRepository: MessageRepository = {
  async countByUserSince(userId, differenceInHours) {
    try {
      const cutoffTime = new Date(
        Date.now() - differenceInHours * 60 * 60 * 1000
      );

      const [stats] = await db
        .select({ count: count(message.id) })
        .from(message)
        .innerJoin(chat, eq(message.chatId, chat.id))
        .where(
          and(
            eq(chat.userId, userId),
            gte(message.createdAt, cutoffTime),
            eq(message.role, "user")
          )
        )
        .execute();

      return stats?.count ?? 0;
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async deleteByChatIdAfterTimestamp(chatId, timestamp) {
    try {
      const messagesToDelete = await db
        .select({ id: message.id })
        .from(message)
        .where(
          and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
        );

      const messageIds = messagesToDelete.map(
        (currentMessage) => currentMessage.id
      );

      if (messageIds.length > 0) {
        await db
          .delete(vote)
          .where(
            and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
          );

        return await db
          .delete(message)
          .where(
            and(eq(message.chatId, chatId), inArray(message.id, messageIds))
          );
      }
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async findById(id) {
    try {
      return await db.select().from(message).where(eq(message.id, id));
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async listByChatId(chatId) {
    try {
      return await db
        .select()
        .from(message)
        .where(eq(message.chatId, chatId))
        .orderBy(asc(message.createdAt));
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async mergeInteractionResponses({ chatId, userId, responses }) {
    return await db.transaction(async (tx) => {
      const [owner] = await tx
        .select()
        .from(chat)
        .where(eq(chat.id, chatId))
        .for("update");
      if (!owner || owner.userId !== userId) {
        throw new ChatbotError("forbidden:chat");
      }
      const current = await tx
        .select()
        .from(message)
        .where(eq(message.chatId, chatId))
        .orderBy(asc(message.createdAt));
      const stored = convertToUIMessages(current);
      const latest = stored.at(-1);
      if (latest?.role !== "assistant") {
        throw new ChatbotError("bad_request:api");
      }
      let merged: ChatMessage[];
      try {
        const answers = applyAskUserResponses(stored, responses);
        // 保持审批 ID/决定匹配语义；新 Ask 协议只处理最新一条 assistant。
        merged = applyToolApprovals(
          answers.messages,
          responses.filter((item) => item.id === latest.id)
        );
      } catch (error) {
        throw new ChatbotError("bad_request:api", { cause: error });
      }
      const parts = merged.at(-1)?.parts ?? [];
      const changed = !sameInteractionValue(latest.parts, parts);
      if (changed) {
        await tx
          .update(message)
          .set({ parts })
          .where(and(eq(message.chatId, chatId), eq(message.id, latest.id)));
      }
      return {
        changed,
        messages: current.map((item, index) =>
          index === current.length - 1 ? { ...item, parts } : item
        ),
      };
    });
  },

  async replaceEditedTurn(input) {
    const { chatId, userId, snapshot, edited, answer } = input;
    await db.transaction(async (tx) => {
      const [owner] = await tx
        .select()
        .from(chat)
        .where(eq(chat.id, chatId))
        .for("update");
      if (!owner || owner.userId !== userId) {
        throw new ChatbotError("forbidden:chat");
      }
      const current = await tx
        .select()
        .from(message)
        .where(eq(message.chatId, chatId))
        .orderBy(asc(message.createdAt));
      const unchanged =
        current.length === snapshot.length &&
        current.every(
          (item, index) =>
            item.id === snapshot[index].id &&
            item.role === snapshot[index].role &&
            JSON.stringify(item.parts) === JSON.stringify(snapshot[index].parts)
        );
      const text = edited.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
      const prepared = prepareMessageEdit(
        current as unknown as ChatMessage[],
        edited.id,
        text
      );
      if (
        !unchanged ||
        !prepared ||
        JSON.stringify(prepared.edited.parts) !==
          JSON.stringify(edited.parts) ||
        answer.chatId !== chatId ||
        answer.role !== "assistant" ||
        !Array.isArray(answer.parts) ||
        !answer.parts.length
      ) {
        throw new ChatbotError("bad_request:api");
      }
      const trailing = current.slice(prepared.index + 1).map((item) => item.id);
      if (trailing.length) {
        await tx
          .delete(vote)
          .where(
            and(eq(vote.chatId, chatId), inArray(vote.messageId, trailing))
          );
        await tx
          .delete(message)
          .where(
            and(eq(message.chatId, chatId), inArray(message.id, trailing))
          );
      }
      // Preserve the edited user row and its committed attachment associations.
      await tx
        .update(message)
        .set({ parts: prepared.edited.parts })
        .where(and(eq(message.chatId, chatId), eq(message.id, edited.id)));
      await tx.insert(message).values(answer as never);
    });
  },

  async replaceRegeneratedAnswer(input) {
    const { chatId, userId, snapshot, answer } = input;
    await db.transaction(async (tx) => {
      const [owner] = await tx
        .select()
        .from(chat)
        .where(eq(chat.id, chatId))
        .for("update");
      if (!owner || owner.userId !== userId) {
        throw new ChatbotError("forbidden:chat");
      }
      const current = await tx
        .select()
        .from(message)
        .where(eq(message.chatId, chatId))
        .orderBy(asc(message.createdAt));
      const unchanged =
        current.length === snapshot.length &&
        current.every(
          (item, index) =>
            item.id === snapshot[index].id &&
            item.role === snapshot[index].role &&
            JSON.stringify(item.parts) === JSON.stringify(snapshot[index].parts)
        );
      const prepared = prepareRegeneration(
        current as unknown as ChatMessage[],
        current.at(-2)?.id ?? ""
      );
      if (
        !unchanged ||
        !prepared ||
        answer.chatId !== chatId ||
        answer.role !== "assistant" ||
        answer.id !== prepared.answerId ||
        !Array.isArray(answer.parts) ||
        !answer.parts.length
      ) {
        throw new ChatbotError("bad_request:api");
      }
      await tx
        .delete(vote)
        .where(and(eq(vote.chatId, chatId), eq(vote.messageId, answer.id)));
      await tx
        .update(message)
        .set({ attachments: answer.attachments, parts: answer.parts })
        .where(and(eq(message.chatId, chatId), eq(message.id, answer.id)));
    });
  },

  async saveMany(messages) {
    try {
      return await db.transaction(async (tx) => {
        // Cooperate with regeneration: append and replace serialize per chat.
        await tx
          .select({ id: chat.id })
          .from(chat)
          .where(
            inArray(chat.id, [...new Set(messages.map((item) => item.chatId))])
          )
          .orderBy(asc(chat.id))
          .for("update");
        return await tx.insert(message).values(messages as never);
      });
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async updateContinuationParts({ chatId, userId, snapshot, response }) {
    return await db.transaction(async (tx) => {
      const [owner] = await tx
        .select()
        .from(chat)
        .where(eq(chat.id, chatId))
        .for("update");
      if (!owner || owner.userId !== userId) {
        throw new ChatbotError("forbidden:chat");
      }
      const current = await tx
        .select()
        .from(message)
        .where(eq(message.chatId, chatId))
        .orderBy(asc(message.createdAt));
      const unchanged =
        current.length === snapshot.length &&
        current.every(
          (item, index) =>
            item.id === snapshot[index].id &&
            item.role === snapshot[index].role &&
            sameInteractionValue(item.parts, snapshot[index].parts)
        );
      if (
        !unchanged ||
        current.at(-1)?.id !== response.id ||
        response.role !== "assistant"
      ) {
        return false;
      }
      await tx
        .update(message)
        .set({ parts: response.parts })
        .where(and(eq(message.chatId, chatId), eq(message.id, response.id)));
      return true;
    });
  },

  async updateParts(id, parts) {
    try {
      return await db
        .update(message)
        .set({ parts: parts as never })
        .where(eq(message.id, id));
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },
};

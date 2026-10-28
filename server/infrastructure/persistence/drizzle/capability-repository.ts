import "server-only";
import { and, eq } from "drizzle-orm";
import type { ScopeSnapshot } from "@/server/domain/capability/schema";
import { selectionSchema } from "@/server/domain/capability/schema";
import { ChatbotError } from "@/server/shared/errors";
import { db } from "./client";
import type { SettingsRepository } from "./mcp-settings-repository";
import { capabilitySettings, chat, chatCapabilityScope } from "./schema";

export function personalSettingsRepository(
  userId: string,
  kind: "mcp" | "skills"
): SettingsRepository {
  return {
    async compareAndSwap(expected, next) {
      const { updatedBy: _, ...value } = next;
      const rows =
        expected === 0
          ? await db
              .insert(capabilitySettings)
              .values({ ...value, kind, userId })
              .onConflictDoNothing()
              .returning({ revision: capabilitySettings.revision })
          : await db
              .update(capabilitySettings)
              .set(value)
              .where(
                and(
                  eq(capabilitySettings.userId, userId),
                  eq(capabilitySettings.kind, kind),
                  eq(capabilitySettings.revision, expected)
                )
              )
              .returning({ revision: capabilitySettings.revision });
      return rows.length === 1;
    },
    async read() {
      const [row] = await db
        .select()
        .from(capabilitySettings)
        .where(
          and(
            eq(capabilitySettings.userId, userId),
            eq(capabilitySettings.kind, kind)
          )
        );
      return row ? { ...row, updatedBy: userId } : null;
    },
  };
}
export interface ScopeRepository {
  bind: (
    userId: string,
    chatId: string,
    expected: number,
    next: Omit<ScopeSnapshot, "revision">
  ) => Promise<ScopeSnapshot>;
  read: (userId: string, chatId: string) => Promise<ScopeSnapshot | null>;
}
export const scopeRepository: ScopeRepository = {
  bind(userId, chatId, expected, next) {
    return db.transaction(async (tx) => {
      const [owner] = await tx
        .select({ userId: chat.userId })
        .from(chat)
        .where(eq(chat.id, chatId))
        .for("update");
      if (!owner || owner.userId !== userId) {
        throw new ChatbotError("forbidden:chat");
      }
      const [current] = await tx
        .select()
        .from(chatCapabilityScope)
        .where(eq(chatCapabilityScope.chatId, chatId));
      if ((current?.revision ?? 0) !== expected) {
        throw new ChatbotError("bad_request:api");
      }
      const value = {
        chatId,
        grants: next.grants,
        revision: expected + 1,
        selection: next.selection,
        updatedAt: new Date(),
        userId,
      };
      await tx
        .insert(chatCapabilityScope)
        .values(value)
        .onConflictDoUpdate({ set: value, target: chatCapabilityScope.chatId });
      return { revision: value.revision, ...next };
    });
  },
  async read(userId, chatId) {
    const [owner] = await db
      .select({ userId: chat.userId })
      .from(chat)
      .where(eq(chat.id, chatId));
    if (!owner) {
      return null;
    }
    if (owner.userId !== userId) {
      throw new ChatbotError("forbidden:chat");
    }
    const [row] = await db
      .select()
      .from(chatCapabilityScope)
      .where(
        and(
          eq(chatCapabilityScope.chatId, chatId),
          eq(chatCapabilityScope.userId, userId)
        )
      );
    return row
      ? {
          grants: row.grants as Record<string, string>,
          revision: row.revision,
          selection: selectionSchema.parse(row.selection),
        }
      : null;
  },
};

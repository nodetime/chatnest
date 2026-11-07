import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { cleanupDeletedAssetIds } from "@/server/application/uploads/service";
import type {
  AccountDeletionQueueItem,
  AccountExport,
  AccountRepository,
  AccountSettingsProjection,
} from "@/server/domain/account/repository";
import { getEnv } from "@/server/shared/env";
import { ChatbotError } from "@/server/shared/errors";
import { db } from "./client";
import {
  accountDeletionRequest,
  capabilitySettings,
  chat,
  document,
  externalIdentity,
  message,
  stream,
  suggestion,
  uploadAsset,
  user,
  userPreferences,
  vote,
} from "./schema";
import { userRepository } from "./user-repository";

type Executor = Pick<typeof db, "select">;

function iso(value: Date): string {
  return value.toISOString();
}

async function readProjection(
  executor: Executor,
  userId: string
): Promise<AccountSettingsProjection | null> {
  const [row] = await executor
    .select({
      account: {
        createdAt: user.createdAt,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        name: user.name,
        updatedAt: user.updatedAt,
      },
      preferences: {
        defaultModelId: userPreferences.defaultModelId,
        emailNotifications: userPreferences.emailNotifications,
        revision: userPreferences.revision,
        updatedAt: userPreferences.updatedAt,
      },
    })
    .from(user)
    .leftJoin(userPreferences, eq(userPreferences.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);

  if (!row) {
    return null;
  }

  const [deletion] = await executor
    .select({
      id: accountDeletionRequest.id,
      notificationStatus: accountDeletionRequest.notificationStatus,
      reason: accountDeletionRequest.reason,
      remoteDeactivationStatus: accountDeletionRequest.remoteDeactivationStatus,
      requestedAt: accountDeletionRequest.requestedAt,
      retentionPurgedAt: accountDeletionRequest.retentionPurgedAt,
      retentionUntil: accountDeletionRequest.retentionUntil,
      status: accountDeletionRequest.status,
      tombstoneId: accountDeletionRequest.tombstoneId,
    })
    .from(accountDeletionRequest)
    .where(eq(accountDeletionRequest.userId, userId))
    .orderBy(desc(accountDeletionRequest.requestedAt))
    .limit(1);

  return {
    account: {
      ...row.account,
      createdAt: iso(row.account.createdAt),
      updatedAt: iso(row.account.updatedAt),
    },
    deletionRequest: deletion
      ? {
          ...deletion,
          requestedAt: iso(deletion.requestedAt),
          retentionPurgedAt: deletion.retentionPurgedAt
            ? iso(deletion.retentionPurgedAt)
            : null,
          retentionUntil: deletion.retentionUntil
            ? iso(deletion.retentionUntil)
            : null,
        }
      : null,
    preferences: {
      defaultModelId: row.preferences?.defaultModelId ?? null,
      emailNotifications: row.preferences?.emailNotifications ?? true,
      revision: row.preferences?.revision ?? 1,
      updatedAt: iso(row.preferences?.updatedAt ?? row.account.updatedAt),
    },
  };
}

export const accountRepository: AccountRepository = {
  async cancelDeletionRequest(userId) {
    try {
      const changed = await db
        .update(accountDeletionRequest)
        .set({ cancelledAt: new Date(), status: "cancelled" })
        .where(
          and(
            eq(accountDeletionRequest.userId, userId),
            eq(accountDeletionRequest.status, "requested")
          )
        )
        .returning({ id: accountDeletionRequest.id });
      return changed.length === 1;
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async completeDeletionRequest({
    completedBy,
    remoteDeactivationRequestId,
    requestId,
  }) {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .select({
            email: user.email,
            requestId: accountDeletionRequest.id,
            status: accountDeletionRequest.status,
            userId: accountDeletionRequest.userId,
          })
          .from(accountDeletionRequest)
          .innerJoin(user, eq(user.id, accountDeletionRequest.userId))
          .where(eq(accountDeletionRequest.id, requestId))
          .for("update");
        if (!row) {
          return "not_found" as const;
        }
        if (row.status !== "requested") {
          return "already_processed" as const;
        }
        const now = new Date();
        const retentionDays = getEnv().ACCOUNT_DELETION_RETENTION_DAYS ?? 30;
        const retentionUntil = new Date(
          now.getTime() + retentionDays * 86_400_000
        );
        const tombstoneId = `tombstone-${randomUUID()}`;
        await tx
          .update(user)
          .set({
            email: `deleted-${row.userId}@invalid.local`,
            image: null,
            isAnonymous: true,
            name: "已删除账户",
            password: null,
            sessionRevision: sql`${user.sessionRevision} + 1`,
            updatedAt: now,
          })
          .where(eq(user.id, row.userId));
        await tx
          .delete(userPreferences)
          .where(eq(userPreferences.userId, row.userId));
        await tx
          .update(accountDeletionRequest)
          .set({
            completedAt: now,
            completedBy,
            notificationAddress: row.email,
            notificationStatus: "not_configured",
            remoteDeactivationRequestId: remoteDeactivationRequestId ?? null,
            remoteDeactivationStatus: remoteDeactivationRequestId
              ? "completed"
              : "not_required",
            retentionUntil,
            status: "completed",
            tombstoneId,
          })
          .where(eq(accountDeletionRequest.id, row.requestId));
        return "completed" as const;
      });
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async exportData(userId): Promise<AccountExport | null> {
    try {
      const settings = await readProjection(db, userId);
      if (!settings) {
        return null;
      }
      const chats = await db
        .select({
          createdAt: chat.createdAt,
          id: chat.id,
          title: chat.title,
          visibility: chat.visibility,
        })
        .from(chat)
        .where(eq(chat.userId, userId))
        .orderBy(desc(chat.createdAt));
      const messages = await db
        .select({
          attachments: message.attachments,
          chatId: message.chatId,
          createdAt: message.createdAt,
          id: message.id,
          parts: message.parts,
          role: message.role,
        })
        .from(message)
        .innerJoin(chat, eq(message.chatId, chat.id))
        .where(eq(chat.userId, userId))
        .orderBy(message.createdAt);
      const documents = await db
        .select({
          content: document.content,
          createdAt: document.createdAt,
          id: document.id,
          kind: document.kind,
          title: document.title,
        })
        .from(document)
        .where(eq(document.userId, userId))
        .orderBy(desc(document.createdAt));
      const messagesByChat = new Map<
        string,
        AccountExport["chats"][number]["messages"]
      >();
      for (const item of messages) {
        const list = messagesByChat.get(item.chatId) ?? [];
        list.push({
          attachments: item.attachments,
          createdAt: iso(item.createdAt),
          id: item.id,
          parts: item.parts,
          role: item.role,
        });
        messagesByChat.set(item.chatId, list);
      }
      return {
        account: settings.account,
        chats: chats.map((item) => ({
          createdAt: iso(item.createdAt),
          id: item.id,
          messages: messagesByChat.get(item.id) ?? [],
          title: item.title,
          visibility: item.visibility,
        })),
        deletionRequest: settings.deletionRequest,
        documents: documents.map((item) => ({
          content: item.content,
          createdAt: iso(item.createdAt),
          id: item.id,
          kind: item.kind,
          title: item.title,
        })),
        exportedAt: new Date().toISOString(),
        preferences: settings.preferences,
      };
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  getSettings(userId) {
    return readProjection(db, userId).catch((error: unknown) => {
      if (error instanceof ChatbotError) {
        throw error;
      }
      throw new ChatbotError("bad_request:database", { cause: error });
    });
  },

  async listDeletionRequests(limit = 50): Promise<AccountDeletionQueueItem[]> {
    try {
      const rows = await db
        .select({
          completedAt: accountDeletionRequest.completedAt,
          completedBy: accountDeletionRequest.completedBy,
          email: user.email,
          id: accountDeletionRequest.id,
          name: user.name,
          notificationAddress: accountDeletionRequest.notificationAddress,
          notificationStatus: accountDeletionRequest.notificationStatus,
          reason: accountDeletionRequest.reason,
          remoteDeactivationError:
            accountDeletionRequest.remoteDeactivationError,
          remoteDeactivationRequestId:
            accountDeletionRequest.remoteDeactivationRequestId,
          remoteDeactivationStatus:
            accountDeletionRequest.remoteDeactivationStatus,
          requestedAt: accountDeletionRequest.requestedAt,
          retentionPurgedAt: accountDeletionRequest.retentionPurgedAt,
          retentionUntil: accountDeletionRequest.retentionUntil,
          status: accountDeletionRequest.status,
          tombstoneId: accountDeletionRequest.tombstoneId,
          userId: accountDeletionRequest.userId,
        })
        .from(accountDeletionRequest)
        .innerJoin(user, eq(user.id, accountDeletionRequest.userId))
        .orderBy(desc(accountDeletionRequest.requestedAt))
        .limit(Math.min(Math.max(limit, 1), 100));
      return rows.map((row) => ({
        ...row,
        completedAt: row.completedAt ? iso(row.completedAt) : null,
        requestedAt: iso(row.requestedAt),
        retentionPurgedAt: row.retentionPurgedAt
          ? iso(row.retentionPurgedAt)
          : null,
        retentionUntil: row.retentionUntil ? iso(row.retentionUntil) : null,
      }));
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async listPendingDeletionNotifications(limit = 25) {
    try {
      const rows = await db
        .select({
          address: accountDeletionRequest.notificationAddress,
          requestId: accountDeletionRequest.id,
          retentionUntil: accountDeletionRequest.retentionUntil,
          tombstoneId: accountDeletionRequest.tombstoneId,
        })
        .from(accountDeletionRequest)
        .where(
          and(
            eq(accountDeletionRequest.status, "completed"),
            eq(accountDeletionRequest.notificationStatus, "pending")
          )
        )
        .orderBy(accountDeletionRequest.completedAt)
        .limit(Math.min(Math.max(limit, 1), 100));
      return rows.flatMap((row) =>
        row.address
          ? [
              {
                address: row.address,
                requestId: row.requestId,
                retentionUntil: row.retentionUntil
                  ? iso(row.retentionUntil)
                  : null,
                tombstoneId: row.tombstoneId,
              },
            ]
          : []
      );
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async markDeletionNotificationStatus({ requestId, status }) {
    try {
      await db
        .update(accountDeletionRequest)
        .set({ notificationStatus: status })
        .where(
          and(
            eq(accountDeletionRequest.id, requestId),
            eq(accountDeletionRequest.status, "completed")
          )
        );
    } catch (cause) {
      throw new ChatbotError("bad_request:database", { cause });
    }
  },

  async markDeletionRemoteFailure({ error, requestId }) {
    try {
      await db
        .update(accountDeletionRequest)
        .set({
          remoteDeactivationError: error.slice(0, 200),
          remoteDeactivationStatus: "failed",
        })
        .where(
          and(
            eq(accountDeletionRequest.id, requestId),
            eq(accountDeletionRequest.status, "requested")
          )
        );
    } catch (cause) {
      throw new ChatbotError("bad_request:database", { cause });
    }
  },

  async purgeExpiredDeletionData(limit = 25) {
    try {
      const rows = await db
        .select({
          requestId: accountDeletionRequest.id,
          userId: accountDeletionRequest.userId,
        })
        .from(accountDeletionRequest)
        .where(
          and(
            eq(accountDeletionRequest.status, "completed"),
            lte(accountDeletionRequest.retentionUntil, new Date()),
            isNull(accountDeletionRequest.retentionPurgedAt)
          )
        )
        .orderBy(accountDeletionRequest.retentionUntil)
        .limit(Math.min(Math.max(limit, 1), 100));
      let purged = 0;
      let skipped = 0;
      for (const row of rows) {
        // biome-ignore lint/performance/noAwaitInLoops: Each account purge owns a transaction and bounded storage cleanup.
        const assetIds = await db.transaction(async (tx) => {
          const [request] = await tx
            .select({
              retentionPurgedAt: accountDeletionRequest.retentionPurgedAt,
              retentionUntil: accountDeletionRequest.retentionUntil,
              status: accountDeletionRequest.status,
              userId: accountDeletionRequest.userId,
            })
            .from(accountDeletionRequest)
            .where(eq(accountDeletionRequest.id, row.requestId))
            .for("update");
          if (
            request?.status !== "completed" ||
            request.retentionPurgedAt ||
            !request.retentionUntil ||
            request.retentionUntil > new Date()
          ) {
            return null;
          }
          const chats = await tx
            .select({ id: chat.id })
            .from(chat)
            .where(eq(chat.userId, request.userId));
          const chatIds = chats.map((item) => item.id);
          const assets = chatIds.length
            ? await tx
                .select({ id: uploadAsset.id })
                .from(uploadAsset)
                .where(inArray(uploadAsset.chatId, chatIds))
            : [];
          if (chatIds.length) {
            await tx
              .update(uploadAsset)
              .set({ state: "deleting" })
              .where(inArray(uploadAsset.chatId, chatIds));
            await tx.delete(vote).where(inArray(vote.chatId, chatIds));
            await tx.delete(message).where(inArray(message.chatId, chatIds));
            await tx.delete(stream).where(inArray(stream.chatId, chatIds));
            await tx.delete(chat).where(inArray(chat.id, chatIds));
          }
          await tx
            .delete(suggestion)
            .where(eq(suggestion.userId, request.userId));
          await tx.delete(document).where(eq(document.userId, request.userId));
          await tx
            .delete(capabilitySettings)
            .where(eq(capabilitySettings.userId, request.userId));
          await tx
            .delete(externalIdentity)
            .where(eq(externalIdentity.userId, request.userId));
          return assets.map((asset) => asset.id);
        });
        if (assetIds === null) {
          skipped += 1;
          continue;
        }
        const cleanup = await cleanupDeletedAssetIds(assetIds);
        if (cleanup.failed > 0) {
          skipped += 1;
          continue;
        }
        await db
          .update(accountDeletionRequest)
          .set({ retentionPurgedAt: new Date() })
          .where(
            and(
              eq(accountDeletionRequest.id, row.requestId),
              isNull(accountDeletionRequest.retentionPurgedAt)
            )
          );
        purged += 1;
      }
      return { inspected: rows.length, purged, skipped };
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async requestDeletion(userId, reason) {
    try {
      return await db.transaction(async (tx) => {
        const [account] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, userId))
          .for("update");
        if (!account) {
          return null;
        }
        const [pending] = await tx
          .select({ id: accountDeletionRequest.id })
          .from(accountDeletionRequest)
          .where(
            and(
              eq(accountDeletionRequest.userId, userId),
              eq(accountDeletionRequest.status, "requested")
            )
          )
          .limit(1);
        if (!pending) {
          await tx.insert(accountDeletionRequest).values({
            reason,
            userId,
          });
        }
        return readProjection(tx, userId);
      });
    } catch (error) {
      if (error instanceof ChatbotError) {
        throw error;
      }
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  revokeSessions(userId) {
    return userRepository.revokeSessions(userId);
  },

  async updatePreferences(input) {
    try {
      return await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ revision: userPreferences.revision })
          .from(userPreferences)
          .where(eq(userPreferences.userId, input.userId))
          .for("update");
        const currentRevision = existing?.revision ?? 1;
        if (currentRevision !== input.expectedRevision) {
          throw new Error("ACCOUNT_SETTINGS_REVISION_CONFLICT");
        }
        const nextRevision = currentRevision + 1;
        if (existing) {
          await tx
            .update(userPreferences)
            .set({
              defaultModelId: input.defaultModelId,
              emailNotifications: input.emailNotifications,
              revision: nextRevision,
              updatedAt: new Date(),
            })
            .where(eq(userPreferences.userId, input.userId));
        } else {
          await tx.insert(userPreferences).values({
            defaultModelId: input.defaultModelId,
            emailNotifications: input.emailNotifications,
            revision: nextRevision,
            userId: input.userId,
          });
        }
        return readProjection(tx, input.userId);
      });
    } catch (error) {
      if (error instanceof ChatbotError) {
        throw error;
      }
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },

  async updateProfile(input) {
    try {
      await db
        .update(user)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(user.id, input.userId));
      return readProjection(db, input.userId);
    } catch (error) {
      throw new ChatbotError("bad_request:database", { cause: error });
    }
  },
};

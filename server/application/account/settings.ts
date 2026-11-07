import { z } from "zod";
import { runAccountDeletionWorkerOnce } from "@/server/application/account/deletion-worker";
import { runAccountNotificationWorkerOnce } from "@/server/application/account/notification-worker";
import { runAccountRetentionWorkerOnce } from "@/server/application/account/retention-worker";
import type {
  AccountDeletionNotification,
  AccountDeletionQueueItem,
  AccountExport,
  AccountRepository,
  AccountSettingsProjection,
} from "@/server/domain/account/repository";
import { allowedModelIds } from "@/server/domain/model/models";

const profileInput = z.object({
  name: z.string().trim().max(80).nullable(),
});

const preferencesInput = z.object({
  defaultModelId: z.string().trim().max(128).nullable(),
  emailNotifications: z.boolean(),
  expectedRevision: z.number().int().positive(),
});

export function createAccountSettingsService(
  options:
    | {
        repository: AccountRepository;
        deactivatePlatformIdentity?: (input: {
          subject: string;
        }) => Promise<{ requestId?: string } | undefined>;
        notifyDeletion?: (input: AccountDeletionNotification) => Promise<void>;
        notificationLimit?: number;
        retentionLimit?: number;
      }
    | AccountRepository
) {
  const repository = "repository" in options ? options.repository : options;
  const deactivatePlatformIdentity =
    "repository" in options ? options.deactivatePlatformIdentity : undefined;
  const retentionLimit =
    "repository" in options ? options.retentionLimit : undefined;
  const notifyDeletion =
    "repository" in options ? options.notifyDeletion : undefined;
  const notificationLimit =
    "repository" in options ? options.notificationLimit : undefined;
  return {
    cancelDeletion(userId: string) {
      return repository.cancelDeletionRequest(userId);
    },
    completeDeletionRequest(input: { completedBy: string; requestId: string }) {
      return repository.completeDeletionRequest(input);
    },
    exportData(userId: string): Promise<AccountExport | null> {
      return repository.exportData(userId);
    },

    get(userId: string): Promise<AccountSettingsProjection | null> {
      return repository.getSettings(userId);
    },

    listDeletionRequests(limit?: number): Promise<AccountDeletionQueueItem[]> {
      return repository.listDeletionRequests(limit);
    },

    requestDeletion(userId: string, reason: unknown) {
      const normalized = typeof reason === "string" ? reason.trim() : "";
      if (normalized.length > 500) {
        throw new Error("INVALID_DELETION_REASON");
      }
      return repository.requestDeletion(userId, normalized || null);
    },

    revokeSessions(userId: string) {
      return repository.revokeSessions(userId);
    },
    runDeletionWorker() {
      return runAccountDeletionWorkerOnce({
        deactivatePlatformIdentity,
        repository,
      });
    },
    runNotificationWorker() {
      if (
        !notifyDeletion ||
        !repository.listPendingDeletionNotifications ||
        !repository.markDeletionNotificationStatus
      ) {
        return Promise.resolve({
          failed: 0,
          inspected: 0,
          sent: 0,
          skipped: true,
        });
      }
      return runAccountNotificationWorkerOnce({
        limit: notificationLimit,
        notifier: notifyDeletion,
        repository: {
          listPendingDeletionNotifications:
            repository.listPendingDeletionNotifications,
          markDeletionNotificationStatus:
            repository.markDeletionNotificationStatus,
        },
      });
    },
    runRetentionWorker() {
      if (!repository.purgeExpiredDeletionData) {
        throw new Error("ACCOUNT_RETENTION_WORKER_UNAVAILABLE");
      }
      return runAccountRetentionWorkerOnce({
        limit: retentionLimit,
        repository: repository.purgeExpiredDeletionData,
      });
    },

    updatePreferences(userId: string, input: unknown) {
      const parsed = preferencesInput.parse(input);
      const defaultModelId = parsed.defaultModelId || null;
      if (defaultModelId !== null && !allowedModelIds.has(defaultModelId)) {
        throw new Error("INVALID_DEFAULT_MODEL");
      }
      return repository.updatePreferences({
        ...parsed,
        defaultModelId,
        userId,
      });
    },

    updateProfile(userId: string, input: unknown) {
      const parsed = profileInput.parse(input);
      return repository.updateProfile({ ...parsed, userId });
    },
  };
}

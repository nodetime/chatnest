import type {
  AccountDeletionNotification,
  AccountRepository,
} from "@/server/domain/account/repository";

export type DeletionNotificationWebhookOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  token?: string;
  url: string;
};

export async function sendDeletionNotification(
  notification: AccountDeletionNotification,
  options: DeletionNotificationWebhookOptions
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 5000
  );
  try {
    const response = await (options.fetcher ?? fetch)(options.url, {
      body: JSON.stringify({
        address: notification.address,
        event: "account.deletion.completed",
        requestId: notification.requestId,
        retentionUntil: notification.retentionUntil,
        tombstoneId: notification.tombstoneId,
      }),
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      method: "POST",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`ACCOUNT_NOTIFICATION_FAILED_${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function runAccountNotificationWorkerOnce({
  limit = 25,
  notifier,
  repository,
}: {
  limit?: number;
  notifier: (notification: AccountDeletionNotification) => Promise<void>;
  repository: Pick<
    AccountRepository,
    "listPendingDeletionNotifications" | "markDeletionNotificationStatus"
  >;
}) {
  if (
    !repository.listPendingDeletionNotifications ||
    !repository.markDeletionNotificationStatus
  ) {
    throw new Error("ACCOUNT_NOTIFICATION_WORKER_UNAVAILABLE");
  }
  const rows = await repository.listPendingDeletionNotifications(limit);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: Notifications are bounded and individually idempotent.
      await notifier(row);
      await repository.markDeletionNotificationStatus({
        requestId: row.requestId,
        status: "sent",
      });
      sent += 1;
    } catch {
      failed += 1;
      await repository.markDeletionNotificationStatus({
        requestId: row.requestId,
        status: "pending",
      });
    }
  }
  return { failed, inspected: rows.length, sent };
}

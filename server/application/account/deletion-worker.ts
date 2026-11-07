import type { AccountRepository } from "@/server/domain/account/repository";

export async function runAccountDeletionWorkerOnce({
  actor = "system:account-deletion-worker",
  limit = 25,
  repository,
  deactivatePlatformIdentity,
}: {
  actor?: string;
  limit?: number;
  repository: Pick<
    AccountRepository,
    | "completeDeletionRequest"
    | "listDeletionRequests"
    | "markDeletionRemoteFailure"
  >;
  deactivatePlatformIdentity?: (input: { subject: string }) => Promise<
    | {
        requestId?: string;
      }
    | undefined
  >;
}) {
  const rows = await repository.listDeletionRequests(limit);
  let completed = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.status !== "requested") {
      skipped += 1;
      continue;
    }
    let remoteDeactivationRequestId: string | undefined;
    if (deactivatePlatformIdentity) {
      try {
        // Deactivate the platform subject before anonymizing the local account;
        // the remote operation is idempotent and can be retried safely.
        // biome-ignore lint/performance/noAwaitInLoops: Each remote identity deactivation is independently idempotent and must precede its local CAS.
        const result = await deactivatePlatformIdentity({
          subject: row.userId,
        });
        remoteDeactivationRequestId = result?.requestId;
      } catch (error) {
        await repository.markDeletionRemoteFailure({
          error:
            error instanceof Error
              ? error.message
              : "REMOTE_DEACTIVATION_FAILED",
          requestId: row.id,
        });
        skipped += 1;
        continue;
      }
    }
    const result = await repository.completeDeletionRequest({
      completedBy: actor,
      ...(remoteDeactivationRequestId ? { remoteDeactivationRequestId } : {}),
      requestId: row.id,
    });
    if (result === "completed") {
      completed += 1;
    } else {
      skipped += 1;
    }
  }
  return { completed, inspected: rows.length, skipped };
}

import type { BillingRepository } from "@/server/domain/billing/repository";
import type { PlatformBillingClient, PlatformReportInput } from "./protocol";

export function replayDeadLetterSettlement(
  repository: BillingRepository,
  id: string
): Promise<boolean> {
  if (!repository.requeueSettlement || !id) {
    return Promise.resolve(false);
  }
  return repository.requeueSettlement(id);
}

export async function runSettlementWorkerOnce(options: {
  client: PlatformBillingClient;
  leaseMs?: number;
  limit?: number;
  maxAttempts?: number;
  repository: BillingRepository;
}) {
  const { client, repository } = options;
  if (
    !repository.listPendingSettlement ||
    !repository.claimSettlement ||
    !repository.finishSettlement ||
    !client.reportInternal
  ) {
    return {
      deadLettered: 0,
      expired: 0,
      failed: 0,
      processed: 0,
      succeeded: 0,
    };
  }
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 8));
  const rows = await repository.listPendingSettlement(
    options.limit ?? 25,
    options.leaseMs
  );
  let succeeded = 0;
  let failed = 0;
  let deadLettered = 0;
  for (const row of rows) {
    // biome-ignore lint/performance/noAwaitInLoops: CAS claim must remain ordered per row.
    if (!(await repository.claimSettlement(row.id, options.leaseMs))) {
      continue;
    }
    try {
      const payload = row.payload as PlatformReportInput;
      const reportInput: PlatformReportInput =
        row.command === "cancel"
          ? { ...payload, outcome: "failed" }
          : row.command === "reconcile"
            ? { ...payload, outcome: "unknown" }
            : payload;
      await client.reportInternal(reportInput);
      await repository.markSettled?.({ operationId: row.operationId });
      await repository.finishSettlement({ id: row.id, state: "succeeded" });
      succeeded += 1;
    } catch {
      const attempts = row.attempts + 1;
      const isDeadLetter = attempts >= maxAttempts;
      await repository.finishSettlement(
        isDeadLetter
          ? { id: row.id, state: "dead_letter" }
          : {
              id: row.id,
              nextAttemptAt: new Date(
                Date.now() + Math.min(60_000, attempts * 5000)
              ),
              state: "failed",
            }
      );
      failed += 1;
      if (isDeadLetter) {
        deadLettered += 1;
      }
    }
  }
  let expired = 0;
  if (client.expireWalletGrants) {
    try {
      ({ expired } = await client.expireWalletGrants());
    } catch {
      failed += 1;
    }
  }
  return { deadLettered, expired, failed, processed: rows.length, succeeded };
}

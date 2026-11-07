import type { AccountRepository } from "@/server/domain/account/repository";

type PurgeExpiredDeletionData = NonNullable<
  AccountRepository["purgeExpiredDeletionData"]
>;

export function runAccountRetentionWorkerOnce({
  limit = 25,
  repository,
}: {
  limit?: number;
  repository: PurgeExpiredDeletionData;
}) {
  return repository(limit);
}

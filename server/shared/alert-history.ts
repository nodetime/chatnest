import { z } from "zod";
export const alertReasons = [
  "settlement_dead_letter",
  "settlement_failed",
  "deletion_remote_pending",
  "account_retention_skipped",
  "account_notification_failed",
  "payment_recovery_failed",
  "payment_case_due",
  "payment_case_gap",
  "timeout",
  "unexpected",
  "settlement_route_failed",
  "deletion_route_failed",
  "notification_route_failed",
  "retention_route_failed",
  "payment_reconcile_failed",
  "payment_recovery_invalid",
] as const;
export const alertEventSchema = z
  .object({
    httpStatus: z.number().int().min(100).max(599).nullable(),
    id: z.uuid(),
    kind: z.enum(["billing_attention", "worker_failed"]),
    outcome: z.enum(["pending", "delivered", "failed", "skipped"]),
    reasons: z.array(z.enum(alertReasons)).min(1).max(alertReasons.length),
  })
  .strict()
  .refine((value) =>
    value.outcome === "delivered"
      ? value.httpStatus !== null &&
        value.httpStatus >= 200 &&
        value.httpStatus < 300
      : value.outcome === "failed"
        ? value.httpStatus === null ||
          value.httpStatus < 200 ||
          value.httpStatus >= 300
        : value.httpStatus === null
  );
export type AlertEventInput = z.infer<typeof alertEventSchema>;

const historyPositionSchema = z
  .object({
    createdAt: z.iso.datetime({ precision: 6 }),
    id: z.uuid(),
  })
  .strict();
export function parseAlertHistoryCursor(value: string) {
  if (value.length !== 64) {
    throw new Error("INVALID_HISTORY_CURSOR");
  }
  const [createdAt, id] = value.split("|");
  return historyPositionSchema.parse({ createdAt, id });
}
export const alertHistoryPageSchema = z
  .object({
    items: z
      .array(
        alertEventSchema.safeExtend({
          createdAt: z.iso.datetime(),
          updatedAt: z.iso.datetime(),
        })
      )
      .max(30),
    nextCursor: z
      .string()
      .refine((value) => {
        try {
          parseAlertHistoryCursor(value);
          return true;
        } catch {
          return false;
        }
      })
      .nullable(),
    retentionDays: z.literal(30),
  })
  .strict();
export type AlertHistoryPage = z.infer<typeof alertHistoryPageSchema>;

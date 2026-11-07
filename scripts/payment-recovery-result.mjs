import { PaymentRecoveryWireSchema } from "./generated/payment-recovery-schema.mjs";

export function normalizePaymentRecovery(value) {
  const current = PaymentRecoveryWireSchema.safeParse(value);
  if (!current.success) {
    throw new Error("PAYMENT_RECOVERY_INVALID");
  }
  const { data } = current;
  if (
    data.reconciled !== data.events.length ||
    data.caseRisk.dueSoonOrOverdue > data.caseRisk.total ||
    data.caseRisk.withGap > data.caseRisk.total
  ) {
    throw new Error("PAYMENT_RECOVERY_INVALID");
  }
  const failed = data.events.filter(
    (event) => event.status < 200 || event.status >= 300
  ).length;
  if (data.failed !== failed) {
    throw new Error("PAYMENT_RECOVERY_INVALID");
  }
  return data;
}

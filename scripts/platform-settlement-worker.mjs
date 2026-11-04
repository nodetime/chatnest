import { normalizePaymentRecovery } from "./payment-recovery-result.mjs";

const baseUrl = process.env.CHATNEST_BASE_URL;
const controlToken = process.env.CHATNEST_CONTROL_TOKEN;
class WorkerFailure extends Error {
  constructor(reason) {
    super(reason);
    this.name = "WorkerFailure";
    this.reason = reason;
  }
}

if (!baseUrl || !controlToken) {
  console.error("CHATNEST_BASE_URL and CHATNEST_CONTROL_TOKEN are required");
  process.exit(2);
}

const controller = new AbortController();
const timeout = setTimeout(
  () => controller.abort(),
  Number(process.env.CHATNEST_WORKER_TIMEOUT_MS || 30_000)
);
try {
  const response = await fetch(
    new URL("/api/internal/billing/outbox", baseUrl),
    {
      headers: { "x-chatnest-control-token": controlToken },
      method: "POST",
      signal: controller.signal,
    }
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new WorkerFailure("settlement_route_failed");
  }
  const deletionResponse = await fetch(
    new URL("/api/internal/account/deletion-worker", baseUrl),
    {
      headers: { "x-chatnest-control-token": controlToken },
      method: "POST",
      signal: controller.signal,
    }
  );
  const deletion = await deletionResponse.json();
  if (!deletionResponse.ok) {
    throw new WorkerFailure("deletion_route_failed");
  }
  const notificationResponse = await fetch(
    new URL("/api/internal/account/notification-worker", baseUrl),
    {
      headers: { "x-chatnest-control-token": controlToken },
      method: "POST",
      signal: controller.signal,
    }
  );
  const notifications = await notificationResponse.json();
  if (!notificationResponse.ok) {
    throw new WorkerFailure("notification_route_failed");
  }
  const retentionResponse = await fetch(
    new URL("/api/internal/account/retention-worker", baseUrl),
    {
      headers: { "x-chatnest-control-token": controlToken },
      method: "POST",
      signal: controller.signal,
    }
  );
  const retention = await retentionResponse.json();
  if (!retentionResponse.ok) {
    throw new WorkerFailure("retention_route_failed");
  }
  let paymentRecovery = { skipped: true };
  if (
    process.env.PLATFORM_MODE === "connected" &&
    process.env.PLATFORM_BASE_URL &&
    process.env.PLATFORM_SERVICE_TOKEN
  ) {
    const paymentResponse = await fetch(
      new URL(
        "/api/platform/v1/internal/payments/reconcile",
        process.env.PLATFORM_BASE_URL
      ),
      {
        body: JSON.stringify({
          limit: Number(process.env.PAYMENT_RECONCILE_BATCH_SIZE || 25),
        }),
        headers: {
          Authorization: `Bearer ${process.env.PLATFORM_SERVICE_TOKEN}`,
          "Content-Type": "application/json",
          "x-platform-internal": "1",
        },
        method: "POST",
        signal: controller.signal,
      }
    );
    const recoveryBody = await paymentResponse.json();
    if (!paymentResponse.ok) {
      throw new WorkerFailure("payment_reconcile_failed");
    }
    try {
      paymentRecovery = normalizePaymentRecovery(recoveryBody);
    } catch {
      // biome-ignore lint/style/useErrorCause: never carry upstream response content into worker diagnostics.
      throw new WorkerFailure("payment_recovery_invalid");
    }
  }
  console.log(
    JSON.stringify({
      deletion,
      notifications,
      paymentRecovery,
      retention,
      settlement: payload,
    })
  );
  const alertReasons = [];
  if (Number(payload.deadLettered || 0) > 0) {
    alertReasons.push("settlement_dead_letter");
  }
  if (Number(payload.failed || 0) > 0) {
    alertReasons.push("settlement_failed");
  }
  if (Number(deletion.skipped || 0) > 0) {
    alertReasons.push("deletion_remote_pending");
  }
  if (Number(retention.skipped || 0) > 0) {
    alertReasons.push("account_retention_skipped");
  }
  if (Number(notifications.failed || 0) > 0) {
    alertReasons.push("account_notification_failed");
  }
  if (Number(paymentRecovery.failed || 0) > 0) {
    alertReasons.push("payment_recovery_failed");
  }
  if (!paymentRecovery.skipped) {
    if (paymentRecovery.caseRisk.dueSoonOrOverdue > 0) {
      alertReasons.push("payment_case_due");
    }
    if (paymentRecovery.caseRisk.withGap > 0) {
      alertReasons.push("payment_case_gap");
    }
  }
  if (alertReasons.length > 0) {
    console.warn(
      JSON.stringify({ code: "BILLING_ATTENTION", reasons: alertReasons })
    );
  }
  if (
    Number(payload.deadLettered || 0) > 0 ||
    Number(payload.failed || 0) > 0 ||
    Number(paymentRecovery.failed || 0) > 0
  ) {
    process.exitCode = 1;
  }
} catch (error) {
  const failureDetails = {
    reason: error?.name === "AbortError" ? "timeout" : "unexpected",
  };
  if (error instanceof WorkerFailure) {
    failureDetails.reason = error.reason;
  }
  console.error(JSON.stringify({ code: "WORKER_FAILED", ...failureDetails }));
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}

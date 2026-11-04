import { randomUUID } from "node:crypto";
export async function deliverAlert({
  baseUrl,
  controlToken,
  alertUrl,
  kind,
  details,
  fetcher = fetch,
  onHistoryFailure = () => undefined,
}) {
  const id = randomUUID();
  const reasons = kind === "worker_failed" ? [details.reason] : details.reasons;
  async function record(outcome, httpStatus = null) {
    const body = JSON.stringify({ httpStatus, id, kind, outcome, reasons });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let retryable = true;
      try {
        // biome-ignore lint/performance/noAwaitInLoops: only one bounded idempotent history retry.
        const response = await fetcher(
          new URL("/api/internal/billing/alert-events", baseUrl),
          {
            body,
            headers: {
              "Content-Type": "application/json",
              "x-chatnest-control-token": controlToken,
            },
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(5000),
          }
        );
        retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;
        // No response body is evidence or an input; release it without logging private text.
        await response.body?.cancel().catch(() => undefined);
        if (response.ok) {
          return;
        }
      } catch {
        /* 保存失败事实，不保存异常或URL。 */
      }
      if (!retryable || attempt === 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    onHistoryFailure();
  }

  if (!alertUrl) {
    await record("skipped");
    return false;
  }
  await record("pending");
  let status = null;
  let delivered = false;
  try {
    const response = await fetcher(alertUrl, {
      body: JSON.stringify({
        details,
        kind,
        source: "chatnest-settlement-worker",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    ({ status } = response);
    delivered = response.ok;
    await response.body?.cancel().catch(() => undefined);
  } catch {
    /* 只保存失败事实，不保存异常或URL。 */
  }
  await record(delivered ? "delivered" : "failed", status);
  return delivered;
}

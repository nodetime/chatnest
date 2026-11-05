import type { BillingRepository } from "@/server/domain/billing/repository";
import type {
  PlatformBillingClient,
  PlatformReportInput,
  PlatformReserveInput,
} from "./protocol";

type AttemptStore = Pick<
  BillingRepository,
  "claimSending" | "enqueueSettlement" | "markSettled"
>;

export async function reportOrEnqueue(
  store: AttemptStore,
  client: PlatformBillingClient,
  input: PlatformReportInput
) {
  try {
    if (input.outcome === "not_dispatched") {
      if (!client.reportInternal) {
        throw new Error("Internal operation report unavailable");
      }
      await client.reportInternal(input);
    } else {
      await client.report(input);
    }
    await store.markSettled?.({ operationId: input.operationId });
  } catch (error) {
    await store.enqueueSettlement({
      command: "report",
      idempotencyKey: `${input.operationId}:report`,
      operationId: input.operationId,
      payload: input,
    });
    throw error;
  }
}

export async function reserveAndDispatch(
  store: AttemptStore,
  client: PlatformBillingClient,
  input: PlatformReserveInput
) {
  const { attemptId, operationId } = input;
  // Only the local attempt owner may request a permit or release its hold.
  if (!(await store.claimSending({ attemptId, operationId }))) {
    throw new Error("Execution attempt already claimed");
  }
  await client.reserve(input);
  try {
    return await client.dispatch({ attemptId, operationId });
  } catch (error) {
    // Even if Payload issued a permit and its response was lost, no executor
    // received it. This is not a provider attempt, including attempt pricing.
    await reportOrEnqueue(store, client, {
      attemptId,
      operationId,
      outcome: "not_dispatched",
    }).catch(() => undefined);
    throw error;
  }
}

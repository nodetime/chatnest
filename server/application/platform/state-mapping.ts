import type { BillingState } from "@/server/domain/billing/state-machine";

import { SessionStepSchema } from "./generated/schemas";
import type { SessionStep } from "./generated/types";

export type PlatformOperationState = SessionStep["state"];
export type AdjustmentResolution = "capture" | "release";

export function parsePlatformOperationState(
  state: string
): PlatformOperationState {
  const result = SessionStepSchema.shape.state.safeParse(state);
  if (!result.success) {
    throw new Error(`Unknown platform operation state: ${state}`);
  }
  return result.data;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled billing state: ${String(value)}`);
}

/**
 * Local ChatNest execution states deliberately include transport phases that
 * Payload does not persist as money states. Keep that compression explicit so
 * UI and reconciliation code do not invent a second state machine.
 */
export function platformStateForBillingState(
  state: BillingState,
  adjustment?: AdjustmentResolution
): PlatformOperationState | null {
  switch (state) {
    case "idle":
      return null;
    case "reserved":
      return "reserved";
    case "dispatching":
    case "settling":
      return "dispatched";
    case "settled":
      return "settled";
    case "released":
      return "released";
    case "reconcile_pending":
      return "reconcile_pending";
    case "overage_pending":
      return "overage_pending";
    case "adjusted":
      if (!adjustment) {
        throw new Error("adjusted state requires resolution");
      }
      return adjustment === "capture" ? "settled" : "released";
    default:
      return assertNever(state);
  }
}

export function billingStateFromPlatformState(
  state: string
): Exclude<BillingState, "idle" | "adjusted"> {
  switch (parsePlatformOperationState(state)) {
    case "reserved":
      return "reserved";
    case "dispatched":
      return "dispatching";
    case "settled":
      return "settled";
    case "released":
      return "released";
    case "reconcile_pending":
      return "reconcile_pending";
    case "overage_pending":
      return "overage_pending";
    default:
      throw new Error(`Unknown platform operation state: ${state}`);
  }
}

export type BillingState =
  | "idle"
  | "reserved"
  | "dispatching"
  | "settling"
  | "settled"
  | "released"
  | "reconcile_pending"
  | "overage_pending"
  | "adjusted";

export type BillingEvent =
  | { type: "reserve" }
  | { type: "dispatch" }
  | {
      actualPoints: string;
      dispatchEvidence: "not_dispatched" | "started" | "response" | "unknown";
      type: "receipt";
    }
  | { type: "settle" }
  | { type: "release" }
  | { type: "reconcile_charge" }
  | { type: "reconcile_release" }
  | { type: "adjust" }
  | { type: "overage" };

function assertNever(value: never): never {
  throw new Error(`Unhandled billing event: ${JSON.stringify(value)}`);
}

export function transitionBillingState(
  state: BillingState,
  event: BillingEvent
): BillingState {
  switch (event.type) {
    case "reserve":
      if (state !== "idle") {
        throw new Error("reserve requires idle state");
      }
      return "reserved";
    case "dispatch":
      if (state !== "reserved") {
        throw new Error("dispatch requires reserved state");
      }
      return "dispatching";
    case "receipt":
      if (state !== "dispatching") {
        throw new Error("receipt requires dispatching state");
      }
      if (event.dispatchEvidence === "not_dispatched") {
        return "released";
      }
      if (event.dispatchEvidence === "unknown") {
        return "reconcile_pending";
      }
      return "settling";
    case "settle":
      if (state !== "settling") {
        throw new Error("settle requires settling state");
      }
      return "settled";
    case "release":
      if (state !== "reserved" && state !== "settling") {
        throw new Error("release requires reserved or settling state");
      }
      return "released";
    case "reconcile_charge":
      if (state !== "reconcile_pending") {
        throw new Error("reconcile_charge requires reconcile_pending state");
      }
      return "settled";
    case "reconcile_release":
      if (state !== "reconcile_pending") {
        throw new Error("reconcile_release requires reconcile_pending state");
      }
      return "released";
    case "adjust":
      if (state !== "reconcile_pending" && state !== "overage_pending") {
        throw new Error("adjust requires a review state");
      }
      return "adjusted";
    case "overage":
      if (state !== "settling") {
        throw new Error("overage requires settling state");
      }
      return "overage_pending";
    default:
      return assertNever(event);
  }
}

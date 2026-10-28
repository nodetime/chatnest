import type { ToolPart } from "../ai-elements/tool";

type ToolState = ToolPart["state"];
export type ToolDisclosure = {
  manual?: boolean;
  state: ToolState;
  open: boolean;
  identity?: string;
};

export function toolDisclosureIdentity(part: ToolPart) {
  return JSON.stringify([
    part.toolCallId,
    part.state,
    "approval" in part ? part.approval?.id : null,
  ]);
}

export function toolNeedsAttention(state: ToolState) {
  return (
    state === "approval-requested" ||
    state === "output-error" ||
    state === "output-denied"
  );
}

export function initialToolDisclosure(
  state: ToolState,
  identity?: string
): ToolDisclosure {
  return { identity, open: toolNeedsAttention(state), state };
}

// State/attention identities, not rerenders, own automatic disclosure. A user may still
// inspect a completed step or dismiss an unchanged error without losing that choice.
export function reconcileToolDisclosure(
  current: ToolDisclosure,
  state: ToolState,
  identity?: string
): ToolDisclosure {
  if (current.state === state && current.identity === identity) {
    return current;
  }
  return {
    identity,
    manual: toolNeedsAttention(state) ? false : current.manual,
    open: toolNeedsAttention(state)
      ? true
      : current.manual
        ? current.open
        : state === "output-available"
          ? false
          : current.open,
    state,
  };
}

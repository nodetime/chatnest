import type { ToolPart } from "../ai-elements/tool";

type ToolState = ToolPart["state"];
export type ToolDisclosure = { state: ToolState; open: boolean };

export function toolNeedsAttention(state: ToolState) {
  return (
    state === "approval-requested" ||
    state === "output-error" ||
    state === "output-denied"
  );
}

export function initialToolDisclosure(state: ToolState): ToolDisclosure {
  return { open: toolNeedsAttention(state), state };
}

// State transitions, not rerenders, own automatic disclosure. A user may still
// inspect a completed step or dismiss an unchanged error without losing that choice.
export function reconcileToolDisclosure(
  current: ToolDisclosure,
  state: ToolState
): ToolDisclosure {
  if (current.state === state) {
    return current;
  }
  return {
    open: toolNeedsAttention(state)
      ? true
      : state === "output-available"
        ? false
        : current.open,
    state,
  };
}

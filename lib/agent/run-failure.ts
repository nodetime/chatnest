import type { ChatMessage } from "../types";

type FailurePart = {
  type: "data-run-status";
  id: "run-status";
  data: { state: "failed" };
};

// Only platform-observed failure state, never raw provider text or a model answer.
export function createRunFailureReporter() {
  let failed = false;
  return {
    get failed() {
      return failed;
    },
    report(write: (part: FailurePart) => void) {
      if (failed) {
        return;
      }
      failed = true;
      write({
        data: { state: "failed" },
        id: "run-status",
        type: "data-run-status",
      });
    },
  };
}

export function hasRunFailure(message: ChatMessage) {
  return (
    message.role === "assistant" &&
    message.parts.some(
      (part) => part.type === "data-run-status" && part.data?.state === "failed"
    )
  );
}

/** Approval continuation never re-uploads stored outputs, tables or private file content. */
export function compactToolApprovals(
  messages: { id: string; role: string; parts: unknown[] }[]
) {
  return messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => {
      const parts = message.parts.flatMap((value) => {
        if (!value || typeof value !== "object") {
          return [];
        }
        const part = value as {
          type?: unknown;
          toolCallId?: unknown;
          state?: unknown;
          approval?: { id?: unknown; approved?: unknown; reason?: unknown };
        };
        if (
          typeof part.type !== "string" ||
          typeof part.toolCallId !== "string" ||
          !["approval-responded", "output-denied"].includes(
            String(part.state)
          ) ||
          typeof part.approval?.id !== "string" ||
          typeof part.approval.approved !== "boolean"
        ) {
          return [];
        }
        return [
          {
            approval: {
              approved: part.approval.approved,
              id: part.approval.id,
              ...(typeof part.approval.reason === "string"
                ? { reason: part.approval.reason.slice(0, 1000) }
                : {}),
            },
            state: String(part.state),
            toolCallId: part.toolCallId,
            type: part.type,
          },
        ];
      });
      return parts.length
        ? [{ id: message.id, parts, role: "assistant" as const }]
        : [];
    });
}

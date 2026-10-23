type AttachmentReadResultData = {
  name: string;
  segments: { ref: string; text: string }[];
  startSegment: number;
  nextSegment: number | null;
  totalSegments: number;
  status: "ready" | "truncated";
  warnings: string[];
};

// Historical tool output is unknown data. Project only a validated source shape;
// keep every original field, including internal metadata, in call details.
export function parseAttachmentReadResult(
  output: unknown
): AttachmentReadResultData | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const data = output as Record<string, unknown>;
  if (
    typeof data.name !== "string" ||
    !data.name.trim() ||
    !Array.isArray(data.segments) ||
    !data.segments.every(
      (segment) =>
        segment !== null &&
        typeof segment === "object" &&
        typeof segment.ref === "string" &&
        typeof segment.text === "string"
    ) ||
    !Array.isArray(data.warnings) ||
    !data.warnings.every((warning) => typeof warning === "string") ||
    (data.status !== "ready" && data.status !== "truncated") ||
    !Number.isInteger(data.startSegment) ||
    (data.startSegment as number) < 0 ||
    !Number.isInteger(data.totalSegments) ||
    (data.totalSegments as number) < 0 ||
    (data.startSegment as number) + data.segments.length >
      (data.totalSegments as number) ||
    (data.nextSegment !== null &&
      (!Number.isInteger(data.nextSegment) ||
        (data.nextSegment as number) <= (data.startSegment as number) ||
        (data.nextSegment as number) >= (data.totalSegments as number)))
  ) {
    return null;
  }
  return data as AttachmentReadResultData;
}

export function AttachmentReadResult({ output }: { output: unknown }) {
  const data = parseAttachmentReadResult(output);
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        返回内容格式未识别，请查看调用详情中的原始结果。
      </p>
    );
  }
  return (
    <div className="space-y-3 text-sm" data-testid="attachment-read-result">
      {data.status === "truncated" && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          附件仅提取到部分文字。
        </p>
      )}
      {data.nextSegment !== null && (
        <p className="text-xs text-muted-foreground">附件仍有后续内容。</p>
      )}
      {data.warnings.map((warning) => (
        <p className="text-xs text-amber-700 dark:text-amber-400" key={warning}>
          {warning}
        </p>
      ))}
      <section
        aria-label={`${data.name} 返回原文与位置引用`}
        className="max-h-80 overflow-auto space-y-4 rounded-md bg-muted/30 p-3"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The bounded source region supports keyboard scrolling.
        tabIndex={0}
      >
        {data.segments.length === 0 && (
          <p className="text-muted-foreground">本次未返回原文片段。</p>
        )}
        {data.segments.map((segment) => (
          <div className="space-y-1" key={segment.ref}>
            <p className="font-mono text-[11px] text-muted-foreground">
              {segment.ref}
            </p>
            <p className="whitespace-pre-wrap break-words leading-6 [overflow-wrap:anywhere]">
              {segment.text}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}

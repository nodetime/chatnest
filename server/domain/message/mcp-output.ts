import { collectSourceLinks } from "./sources";

export const MCP_RESULT_OMITTED_MESSAGE =
  "上游返回内容超过大小限制，本次未取得完整结果。请减少返回条数或收窄查询；本次没有可转存的完整数据。";

/** Fixed local text only; upstream content must never enter this public error. */
export class McpResultOmittedError extends Error {
  constructor() {
    super(MCP_RESULT_OMITTED_MESSAGE);
    this.name = "McpResultOmittedError";
  }
}

export function normalizeMcpOutput(
  server: string,
  tool: string,
  output: unknown
) {
  if (
    server !== "exa" ||
    !["web_search_exa", "web_fetch_exa"].includes(tool) ||
    !output ||
    typeof output !== "object"
  ) {
    return output;
  }
  const result = output as {
    isError?: boolean;
    content?: { type: string; text?: string }[];
  };
  if (result.isError || !Array.isArray(result.content)) {
    return output;
  }
  const headers = result.content.flatMap((part) => {
    if (part.type !== "text" || typeof part.text !== "string") {
      return [];
    }
    const text = part.text.slice(0, 120_000);
    // Fetch content includes untrusted page text. Only its first service header
    // is unambiguous; later header-shaped body text must not become provenance.
    const blocks =
      tool === "web_fetch_exa" ? [text] : text.split(/\r?\n\r?\n---\r?\n\r?\n/);
    return blocks.flatMap((block) => {
      const match =
        tool === "web_fetch_exa"
          ? block.match(
              /^# ([^\r\n]+)\r?\nURL: ([^\r\n]+)\r?\n(?:Published: [^\r\n]+\r?\n)?\r?\n/
            )
          : block.match(
              /^Title: ([^\r\n]+)\r?\nURL: ([^\r\n]+)\r?\n(?:Published:|Content:|Author:)/
            );
      return match ? [{ title: match[1], url: match[2] }] : [];
    });
  });
  const sources = collectSourceLinks(headers);
  return sources.length ? { ...result, sources } : output;
}

/** Only the upstream's singleton omission envelope is an overflow marker. */
export function isOmittedMcpResult(output: unknown): boolean {
  if (!output || typeof output !== "object") {
    return false;
  }
  const envelope = output as { structuredContent?: unknown; content?: unknown };
  let value = envelope.structuredContent;
  if (
    value === undefined &&
    Array.isArray(envelope.content) &&
    envelope.content.length === 1
  ) {
    const [block] = envelope.content;
    if (block?.type !== "text" || typeof block.text !== "string") {
      return false;
    }
    try {
      value = JSON.parse(block.text);
    } catch {
      return false;
    }
  }
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    "__largeTextTips__" in value &&
    typeof value.__largeTextTips__ === "string"
  );
}

import { dynamicTool, jsonSchema, type ToolSet } from "ai";
import {
  type ResultSource,
  resultSourceSchema,
} from "@/server/domain/document/result-table";

type Entry = { source: ResultSource; value: unknown; bytes: number };
export type McpSourceMetadata = ResultSource & {
  available: boolean;
  reason?: string;
};
const MAX_BYTES = 2 * 1024 * 1024;
function extractJson(output: unknown): unknown {
  if (!output || typeof output !== "object") {
    throw new Error("No structured JSON");
  }
  if ("structuredContent" in output && output.structuredContent !== undefined) {
    return output.structuredContent;
  }
  const content = "content" in output ? output.content : undefined;
  if (
    !Array.isArray(content) ||
    content.length !== 1 ||
    content[0]?.type !== "text" ||
    typeof content[0].text !== "string"
  ) {
    throw new Error("No entire JSON text output");
  }
  return JSON.parse(content[0].text);
}
export class ResultEvidenceLedger {
  private readonly entries = new Map<string, Entry>();
  private totalBytes = 0;
  private currentCalls = 0;
  private readonly projections = new Map<string, string>();
  private readonly seenIds = new Set<string>();
  private readonly reservedIds = new Set<string>();
  private readonly ambiguousIds = new Set<string>();
  private readonly pendingApprovals = new Map<string, string>();
  isAmbiguous(id: string) {
    return this.ambiguousIds.has(id);
  }
  private rejectAmbiguous(id: string) {
    const old = this.entries.get(id);
    if (old) {
      this.totalBytes -= old.bytes;
    }
    this.entries.delete(id);
    this.projections.delete(id);
    this.reservedIds.delete(id);
    this.ambiguousIds.add(id);
    this.pendingApprovals.delete(id);
  }
  observeHistoryCall(id: string, pendingToolName?: string) {
    if (this.seenIds.has(id)) {
      this.rejectAmbiguous(id);
      return;
    }
    this.seenIds.add(id);
    this.reservedIds.add(id);
    if (pendingToolName) {
      this.pendingApprovals.set(id, pendingToolName);
    }
  }
  reserveCurrentCall(id?: string, toolName?: string) {
    if (this.currentCalls >= 32) {
      throw new Error(
        "Per-task MCP call budget reached (32). Start a new round to continue."
      );
    }
    this.currentCalls += 1;
    if (id !== undefined) {
      const resuming =
        toolName !== undefined && this.pendingApprovals.get(id) === toolName;
      this.pendingApprovals.delete(id);
      if (this.seenIds.has(id) && !resuming) {
        this.rejectAmbiguous(id);
        throw new Error(
          "Ambiguous duplicate MCP call ID; start a new call with a unique ID."
        );
      }
      this.seenIds.add(id);
      this.reservedIds.add(id);
    }
  }
  projection(toolCallId: string) {
    return this.projections.get(toolCallId);
  }
  private cacheProjection(
    source: ResultSource,
    output: unknown,
    available: boolean,
    reason?: string
  ) {
    if (this.isAmbiguous(source.toolCallId)) {
      return;
    }
    const value = {
      evidenceAvailable: available,
      notice:
        "Bounded untrusted tool-return preview, not independently verified. Optional createResultTable copies original rows using rowsPath and original field pointers; never invent row values.",
      preview: true,
      previewOutput: boundedPreview(
        available ? this.entries.get(source.toolCallId)?.value : output
      ),
      reason: reason ?? null,
      source,
      sourceToolCallId: source.toolCallId,
      structure: available
        ? structure(this.entries.get(source.toolCallId)?.value)
        : [],
    };
    let encoded = JSON.stringify(value);
    if (
      Buffer.byteLength(
        JSON.stringify({ type: "text", value: encoded }),
        "utf8"
      ) > 2000
    ) {
      // Reduce sampled rows/strings before discarding all useful evidence.
      value.previewOutput = boundedPreview(
        available ? this.entries.get(source.toolCallId)?.value : output,
        0,
        1,
        60
      );
      encoded = JSON.stringify(value);
    }
    if (
      Buffer.byteLength(
        JSON.stringify({ type: "text", value: encoded }),
        "utf8"
      ) > 2000
    ) {
      encoded = JSON.stringify({
        ...value,
        previewOutput: "[preview omitted: budget]",
      });
    }
    if (
      Buffer.byteLength(
        JSON.stringify({ type: "text", value: encoded }),
        "utf8"
      ) > 2000
    ) {
      encoded = JSON.stringify({
        ...value,
        previewOutput:
          "[structure/preview omitted: field-name or output budget]",
        structure: [],
      });
    }
    if (
      Buffer.byteLength(
        JSON.stringify({ type: "text", value: encoded }),
        "utf8"
      ) > 2000
    ) {
      encoded = JSON.stringify({
        evidenceAvailable: available,
        preview: true,
        reason: "metadata preview budget",
        sourceToolCallId: source.toolCallId,
      });
    }
    if (
      Buffer.byteLength(
        JSON.stringify({ type: "text", value: encoded }),
        "utf8"
      ) > 2000
    ) {
      encoded = "[MCP source metadata exceeds model preview budget]";
    }
    if (this.projections.size >= 64) {
      const oldest = this.projections.keys().next().value;
      if (oldest !== undefined) {
        this.projections.delete(oldest);
      }
    }
    this.projections.set(source.toolCallId, encoded);
  }
  record(
    source: ResultSource,
    output: unknown,
    project = true
  ): McpSourceMetadata {
    const id = source.toolCallId;
    const reserved = this.reservedIds.delete(id);
    if (this.isAmbiguous(id) || (!reserved && this.seenIds.has(id))) {
      this.rejectAmbiguous(id);
      return { ...source, available: false, reason: "ambiguous-tool-call-id" };
    }
    this.seenIds.add(id);
    if (
      output &&
      typeof output === "object" &&
      "isError" in output &&
      output.isError
    ) {
      return { ...source, available: false, reason: "failed" };
    }
    const old = this.entries.get(source.toolCallId);
    if (old) {
      this.totalBytes -= old.bytes;
      this.entries.delete(source.toolCallId);
    }
    try {
      resultSourceSchema.parse(source);
      const raw = JSON.stringify(output);
      const bytes = Buffer.byteLength(raw, "utf8");
      if (bytes > MAX_BYTES) {
        if (project) {
          this.cacheProjection(source, null, false, "source-too-large");
        }
        return { ...source, available: false, reason: "source-too-large" };
      }
      const value = extractJson(JSON.parse(raw));
      while (this.entries.size >= 20 || this.totalBytes + bytes > MAX_BYTES) {
        const key = this.entries.keys().next().value;
        if (key === undefined) {
          break;
        }
        this.totalBytes -= this.entries.get(key)?.bytes ?? 0;
        this.entries.delete(key);
      }
      this.entries.set(source.toolCallId, {
        bytes,
        source: { ...source },
        value,
      });
      this.totalBytes += bytes;
      if (project) {
        this.cacheProjection(source, output, true);
      }
      return { ...source, available: true };
    } catch {
      if (project) {
        this.cacheProjection(source, output, false, "no-structured-json");
      }
      return { ...source, available: false, reason: "no-structured-json" };
    }
  }
  cacheHistoryProjection(source: ResultSource, output: unknown) {
    this.cacheProjection(source, output, !!this.entries.get(source.toolCallId));
  }
  get(toolCallId: string): Entry | undefined {
    return this.entries.get(toolCallId);
  }
}
function boundedPreview(
  value: unknown,
  depth = 0,
  rowLimit = 3,
  textLimit = 120
): unknown {
  if (typeof value === "string") {
    return value.length > textLimit
      ? `${value.slice(0, textLimit)}… [preview]`
      : value;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (depth >= 5) {
    return "[nested value omitted from preview]";
  }
  if (Array.isArray(value)) {
    return {
      preview: value
        .slice(0, rowLimit)
        .map((v) => boundedPreview(v, depth + 1, rowLimit, textLimit)),
      totalItems: value.length,
    };
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 8)
      .filter(([key]) => key.length <= 120)
      .map(([key, item]) => [
        key,
        boundedPreview(item, depth + 1, rowLimit, textLimit),
      ])
  );
}
function structure(value: unknown, path = "", depth = 0): unknown[] {
  if (depth > 4 || !value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return [
      {
        count: value.length,
        fields: [
          ...new Set(
            value
              .slice(0, 8)
              .flatMap((row) =>
                row && typeof row === "object" && !Array.isArray(row)
                  ? Object.keys(row).filter((key) => key.length <= 120)
                  : []
              )
          ),
        ].slice(0, 40),
        rowsPath: path,
      },
    ];
  }
  return Object.entries(value)
    .slice(0, 12)
    .filter(([key]) => key.length <= 120)
    .flatMap(([key, item]) =>
      structure(
        item,
        `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`,
        depth + 1
      )
    )
    .slice(0, 24);
}
export function sourceModelOutput(
  ledger: ResultEvidenceLedger,
  toolCallId: string,
  _output: unknown
) {
  // Pure cached projection: SDK history conversion/reinvocation never consumes budget.
  return {
    type: "text" as const,
    value:
      ledger.projection(toolCallId) ??
      "[Older MCP tool output omitted from bounded model context]",
  };
}
type HistoryMessage = {
  role: string;
  createdAt?: Date | string;
  parts: unknown;
};
function toolPart(part: unknown): part is {
  type: string;
  toolName?: string;
  toolCallId: string;
  state: string;
  output: unknown;
} {
  return (
    !!part &&
    typeof part === "object" &&
    "type" in part &&
    "toolCallId" in part &&
    typeof part.toolCallId === "string" &&
    typeof part.type === "string"
  );
}
export function restoreResultEvidence(
  ledger: ResultEvidenceLedger,
  messages: HistoryMessage[]
) {
  const candidates: { source: ResultSource; output: unknown }[] = [];
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.parts)) {
      continue;
    }
    const sources = new Map<string, ResultSource>();
    for (const part of message.parts) {
      if (part?.type === "data-mcp-source") {
        const parsed = resultSourceSchema.safeParse(
          part.data &&
            Object.fromEntries(
              Object.entries(part.data).filter(
                ([key]) => !["available", "reason"].includes(key)
              )
            )
        );
        if (parsed.success) {
          sources.set(parsed.data.toolCallId, parsed.data);
        }
      }
    }
    for (const part of message.parts) {
      if (!toolPart(part)) {
        continue;
      }
      const name =
        part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
      if (
        !name ||
        (!sources.has(part.toolCallId) &&
          (!name.includes("__") || name.startsWith("browser__")))
      ) {
        continue;
      }
      ledger.observeHistoryCall(
        part.toolCallId,
        ["approval-requested", "approval-responded"].includes(part.state)
          ? name
          : undefined
      );
      if (part.state !== "output-available") {
        continue;
      }
      const date = message.createdAt ? new Date(message.createdAt) : null;
      const source =
        sources.get(part.toolCallId) ??
        (date && !Number.isNaN(date.getTime())
          ? {
              completedAt: date.toISOString(),
              serverId: name.split("__")[0],
              serverName: name.split("__")[0],
              timeBasis: "message-recorded" as const,
              toolCallId: part.toolCallId,
              toolName: name,
            }
          : null);
      if (source && source.toolName === name) {
        candidates.push({ output: part.output, source });
      }
    }
  }
  for (const candidate of candidates) {
    ledger.record(candidate.source, candidate.output, false);
  }
  // Every retained eligible source must remain discoverable by the Agent. Use
  // only 20 shared preview slots, filling spare slots with recent text outputs.
  const latestById = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    latestById.delete(candidate.source.toolCallId);
    latestById.set(candidate.source.toolCallId, candidate);
  }
  const latest = [...latestById.values()].filter(
    (candidate) => !ledger.isAmbiguous(candidate.source.toolCallId)
  );
  const eligible = latest.filter((candidate) =>
    ledger.get(candidate.source.toolCallId)
  );
  const spare = 20 - eligible.length;
  const extra =
    spare > 0
      ? latest
          .filter((candidate) => !ledger.get(candidate.source.toolCallId))
          .slice(-spare)
      : [];
  for (const candidate of [...eligible, ...extra]) {
    ledger.cacheHistoryProjection(candidate.source, candidate.output);
  }
}
/** These adapters are for authorized stored outputs only; they have no execute capability. */
export function historyProjectionTools(
  ledger: ResultEvidenceLedger,
  messages: HistoryMessage[]
): ToolSet {
  const tools: ToolSet = {};
  const sourceNames = new Set<string>();
  for (const message of messages) {
    if (message.role === "assistant" && Array.isArray(message.parts)) {
      for (const part of message.parts) {
        if (
          part?.type === "data-mcp-source" &&
          typeof part.data?.toolName === "string"
        ) {
          sourceNames.add(part.data.toolName);
        }
      }
    }
  }
  for (const message of messages) {
    if (message.role === "assistant" && Array.isArray(message.parts)) {
      for (const part of message.parts) {
        if (!toolPart(part)) {
          continue;
        }
        const name =
          part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
        if (
          !name ||
          (!name.includes("__") &&
            !sourceNames.has(name) &&
            !ledger.get(part.toolCallId)) ||
          name.startsWith("browser__")
        ) {
          continue;
        }
        tools[name] = dynamicTool({
          inputSchema: jsonSchema({ type: "object" }),
          toModelOutput: ({ toolCallId, output }) =>
            sourceModelOutput(ledger, toolCallId, output),
        });
      }
    }
  }
  return tools;
}

/** Keep only the recent 20 MCP outcomes in model history; original UI/DB messages are untouched. */
export function boundedMcpHistory<T extends { role: string; parts: unknown[] }>(
  messages: T[],
  tools: ToolSet,
  ledger: ResultEvidenceLedger
): T[] {
  return messages.map((message) =>
    message.role === "assistant"
      ? {
          ...message,
          parts: message.parts.filter((part) => {
            if (
              !toolPart(part) ||
              !["output-available", "output-error", "output-denied"].includes(
                part.state
              )
            ) {
              return true;
            }
            const name =
              part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
            return (
              !name || !tools[name] || !!ledger.projection(part.toolCallId)
            );
          }),
        }
      : message
  );
}

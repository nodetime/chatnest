import type { ArtifactKind } from "@/app/_components/chat/artifact";

export type ArtifactEntry = { id: string; title: string; kind: ArtifactKind };
type CatalogMessage = { role: string; parts?: readonly unknown[] };
const nativeTools = new Set([
  "tool-createDocument",
  "tool-updateDocument",
  "tool-createResultTable",
]);
const documentId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds = new Set(["text", "code", "image", "sheet"]);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/** Presentation-only index. Dynamic MCP tools never assert document membership. */
export function artifactCatalog(
  messages: readonly CatalogMessage[]
): ArtifactEntry[] {
  const entries = new Map<string, ArtifactEntry>();
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    for (const part of message.parts ?? []) {
      if (
        !record(part) ||
        typeof part.type !== "string" ||
        !nativeTools.has(part.type) ||
        part.state !== "output-available"
      ) {
        continue;
      }
      const { output } = part;
      if (
        !record(output) ||
        "error" in output ||
        !nonempty(output.id) ||
        !documentId.test(output.id) ||
        !nonempty(output.title) ||
        typeof output.kind !== "string" ||
        !kinds.has(output.kind)
      ) {
        continue;
      }
      entries.set(output.id, {
        id: output.id,
        kind: output.kind as ArtifactKind,
        title: output.title,
      });
    }
  }
  return [...entries.values()];
}

export function artifactSwitchReason({
  isContentDirty,
  status,
  resultTablePendingChanges = false,
}: {
  resultTablePendingChanges?: boolean;
  isContentDirty: boolean;
  status: "idle" | "streaming";
}): string | null {
  if (status === "streaming") {
    return "产物正在生成，完成后可切换文件";
  }
  if (resultTablePendingChanges) {
    return "表格视图或备注尚未保存，保存完成后可切换文件";
  }
  if (isContentDirty) {
    return "修改尚未保存，保存完成后可切换文件";
  }
  return null;
}

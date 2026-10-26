import type { UIArtifact } from "@/server/domain/document/types";
import type { CustomUIDataTypes } from "@/server/domain/message/types";
export function applyResultTableEvent(
  current: UIArtifact,
  data: CustomUIDataTypes["resultTable"]
): UIArtifact {
  return {
    ...current,
    content: data.content,
    documentId: data.id,
    isVisible: true,
    kind: "sheet",
    status: "idle",
    title: data.title,
  };
}

export function openArtifactPreview(
  current: UIArtifact,
  result: { id?: string; title?: string; kind?: UIArtifact["kind"] },
  boundingBox: UIArtifact["boundingBox"]
): UIArtifact {
  const changingDocument = !!result.id && result.id !== current.documentId;
  return {
    ...current,
    ...(result.id ? { documentId: result.id } : {}),
    ...(changingDocument ? { content: "", status: "idle" as const } : {}),
    ...(result.title ? { title: result.title } : {}),
    ...(result.kind ? { kind: result.kind } : {}),
    boundingBox,
    isVisible: true,
  };
}

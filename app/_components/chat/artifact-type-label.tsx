import type { ArtifactKind } from "./artifact";

export const artifactTypeLabels: Record<ArtifactKind, string> = {
  code: "代码",
  image: "图片",
  sheet: "表格",
  text: "文本",
};
export function ArtifactTypeLabel({ kind }: { kind: ArtifactKind }) {
  return (
    <span
      className="shrink-0 text-[11px] font-normal leading-4 text-muted-foreground"
      data-testid="artifact-type"
    >
      {artifactTypeLabels[kind]}
    </span>
  );
}

import type { ArtifactKind } from "@/app/_components/chat/artifact";

export const artifactTypeLabels: Record<ArtifactKind, string> = {
  code: "代码",
  image: "图片",
  sheet: "表格",
  text: "文本",
};
export function ArtifactTypeLabel({ kind }: { kind: ArtifactKind }) {
  return (
    <span
      className="shrink-0 rounded border border-border/60 bg-secondary/60 px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground"
      data-testid="artifact-type"
    >
      {artifactTypeLabels[kind]}
    </span>
  );
}

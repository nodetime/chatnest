import type { UIArtifact } from "@/server/domain/document/types";

type ExportArtifact = Pick<UIArtifact, "kind" | "content" | "title">;
const formats = {
  code: { extension: "py", mediaType: "text/x-python;charset=utf-8" },
  image: { extension: "png", mediaType: "image/png" },
  sheet: { extension: "csv", mediaType: "text/csv;charset=utf-8" },
  text: { extension: "md", mediaType: "text/markdown;charset=utf-8" },
} as const;

/** Export the displayed native format, without converting or changing its content. */
export function artifactExport(artifact: ExportArtifact) {
  const format = formats[artifact.kind];
  const title =
    artifact.title
      .replace(/[<>:"/\\|?*]/g, "-")
      .split("")
      .map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
      .join("")
      .replace(/^\.+|[.\s]+$/g, "")
      .trim()
      .slice(0, 120) || "artifact";
  return {
    content: artifact.content,
    encoding:
      artifact.kind === "image" ? ("base64" as const) : ("utf8" as const),
    filename: `${title}.${format.extension}`,
    mediaType: format.mediaType,
  };
}

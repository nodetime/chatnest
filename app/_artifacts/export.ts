import type { UIArtifact } from "@/server/domain/document/types";

type ExportArtifact = Pick<UIArtifact, "kind" | "content" | "title">;
const formats = {
  code: { extension: "py", mediaType: "text/x-python;charset=utf-8" },
  image: { extension: "png", mediaType: "image/png" },
  sheet: { extension: "csv", mediaType: "text/csv;charset=utf-8" },
  text: { extension: "md", mediaType: "text/markdown;charset=utf-8" },
} as const;
const sourceMediaTypes: Record<string, string> = {
  css: "text/css;charset=utf-8",
  html: "text/html;charset=utf-8",
  js: "text/javascript;charset=utf-8",
  json: "application/json;charset=utf-8",
  py: "text/x-python;charset=utf-8",
  sh: "text/x-shellscript;charset=utf-8",
  sql: "application/sql;charset=utf-8",
  svg: "image/svg+xml;charset=utf-8",
  ts: "text/typescript;charset=utf-8",
  yaml: "application/yaml;charset=utf-8",
  yml: "application/yaml;charset=utf-8",
};

/** Export the displayed native format, without converting or changing its content. */
export function artifactExport(artifact: ExportArtifact) {
  const extension = artifact.title.split(".").at(-1)?.toLowerCase() ?? "";
  const format =
    artifact.kind === "code" && Object.hasOwn(sourceMediaTypes, extension)
      ? { extension, mediaType: sourceMediaTypes[extension] }
      : artifact.kind === "text" && extension === "txt"
        ? { extension, mediaType: "text/plain;charset=utf-8" }
        : formats[artifact.kind];
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
    filename: title.toLowerCase().endsWith(`.${format.extension}`)
      ? title
      : `${title}.${format.extension}`,
    mediaType: format.mediaType,
  };
}

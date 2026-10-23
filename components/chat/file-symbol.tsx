import { FileCode2, FileImage, FileSpreadsheet, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtifactKind } from "./artifact";

// The same quiet file silhouette for uploaded files and generated artifacts.
export function FileSymbol({
  kind = "text",
  className,
}: {
  kind?: ArtifactKind;
  className?: string;
}) {
  const Icon =
    kind === "sheet"
      ? FileSpreadsheet
      : kind === "code"
        ? FileCode2
        : kind === "image"
          ? FileImage
          : FileText;
  return (
    <Icon
      aria-hidden="true"
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
    />
  );
}

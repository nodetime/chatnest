// biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes per-entry selection closures.
"use client";

import { Check, ChevronsUpDown, FileText } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/app/_components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/_components/ui/dropdown-menu";
import { useArtifact } from "@/app/_hooks/use-artifact";
import { useWorkspace } from "@/app/_hooks/use-workspace";
import { openArtifactPreview } from "@/server/domain/document/stream-state";
import { type ArtifactEntry, artifactSwitchReason } from "./artifact-catalog";
import { ArtifactTypeLabel } from "./artifact-type-label";

export function ArtifactPicker({
  entries,
  activeId,
  title,
  isContentDirty = false,
  resultTablePendingChanges = false,
  status = "idle",
  list = false,
}: {
  entries: ArtifactEntry[];
  activeId?: string;
  title?: string;
  isContentDirty?: boolean;
  resultTablePendingChanges?: boolean;
  status?: "idle" | "streaming";
  list?: boolean;
}) {
  const blockedReason = artifactSwitchReason({
    isContentDirty,
    resultTablePendingChanges,
    status,
  });
  const { setArtifact } = useArtifact();
  const { show } = useWorkspace();
  const select = useCallback(
    (entry: ArtifactEntry) => {
      if (blockedReason) {
        return;
      }
      setArtifact((current) =>
        openArtifactPreview(current, entry, current.boundingBox)
      );
      show("document");
    },
    [blockedReason, setArtifact, show]
  );
  if (list) {
    return (
      <ul aria-label="本次对话的产物" className="w-full max-w-md space-y-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Button
              className="h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-lg border px-4 py-3 text-left"
              disabled={Boolean(blockedReason)}
              onClick={() => select(entry)}
              variant="ghost"
            >
              <FileText className="size-5 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-sm font-medium">
                  {entry.title}
                </span>
                <ArtifactTypeLabel kind={entry.kind} />
              </span>
            </Button>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="min-w-0" title={blockedReason ?? undefined}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="选择本次对话的产物"
            className="h-7 max-w-full justify-start gap-2 px-2 text-sm font-medium"
            disabled={Boolean(blockedReason) || entries.length === 0}
            variant="ghost"
          >
            <span className="truncate">{title || "本次对话的产物"}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-72 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuLabel>
            本次对话 · {entries.length} 个产物
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {entries.map((entry) => (
            <DropdownMenuItem
              className="gap-2 py-2.5"
              key={entry.id}
              onSelect={() => select(entry)}
            >
              <FileText className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{entry.title}</span>
              <ArtifactTypeLabel kind={entry.kind} />
              {entry.id === activeId && <Check className="size-3.5 shrink-0" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {blockedReason && (
        <p className="sr-only" role="status">
          {blockedReason}
        </p>
      )}
    </div>
  );
}

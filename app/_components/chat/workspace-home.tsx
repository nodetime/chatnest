// biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes per-entry workspace handlers.
"use client";
import { ArrowUpRight, ChevronRight, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import useSWR from "swr";
import { useActiveChat } from "@/app/_hooks/use-active-chat";
import { useArtifact } from "@/app/_hooks/use-artifact";
import { useWorkbenchNavigation } from "@/app/_hooks/use-workbench-navigation";
import { useWorkspace } from "@/app/_hooks/use-workspace";
import { fetcher } from "@/app/_lib/utils";
import type { LibraryEntry } from "@/server/domain/document/library";
import { openArtifactPreview } from "@/server/domain/document/stream-state";
import { Button } from "../ui/button";
import { artifactSwitchReason } from "./artifact-catalog";
import { artifactTypeLabels } from "./artifact-type-label";
import { FileSymbol } from "./file-symbol";

export function useSavedArtifacts() {
  return useSWR<LibraryEntry[]>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/library`,
    fetcher,
    { revalidateOnFocus: false }
  );
}

export function useOpenSavedArtifact() {
  const { chatId } = useActiveChat();
  const { artifact, metadata, setArtifact } = useArtifact();
  const workspace = useWorkspace();
  const { navigate } = useWorkbenchNavigation();
  const router = useRouter();
  return (entry: LibraryEntry) => {
    const reason = artifactSwitchReason({
      isContentDirty: metadata?.documentPendingChanges === true,
      resultTablePendingChanges: metadata?.resultTablePendingChanges === true,
      status: artifact.status,
    });
    if (entry.id !== artifact.documentId && reason) {
      toast.error(reason);
      return;
    }
    navigate("chat");
    if (entry.chatId && entry.chatId !== chatId) {
      router.push(`/chat/${entry.chatId}?artifact=${entry.id}`);
      return;
    }
    setArtifact((current) =>
      openArtifactPreview(current, entry, current.boundingBox)
    );
    workspace.show("document");
  };
}

export function WorkspaceHome() {
  const { navigate } = useWorkbenchNavigation();
  return (
    <section
      aria-label="最近产物"
      className="mx-auto w-full max-w-[800px] min-w-0 space-y-3 px-4 sm:px-6"
      data-testid="workspace-home-content"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">最近产物</h2>
        <button
          className="inline-flex shrink-0 items-center gap-1 py-1.5 pl-2 text-xs text-muted-foreground transition-colors hover:text-ring"
          onClick={() => navigate("files")}
          type="button"
        >
          查看全部
          <ChevronRight aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      <SavedArtifactCards compact limit={3} />
    </section>
  );
}

export function SavedArtifactCards({
  limit,
  compact = false,
}: {
  limit?: number;
  compact?: boolean;
}) {
  const { data, error, isLoading, mutate } = useSavedArtifacts();
  const open = useOpenSavedArtifact();
  if (isLoading) {
    return (
      <div
        aria-label="正在加载产物"
        className={
          compact
            ? "h-24 animate-pulse rounded-lg bg-muted/50"
            : "h-32 animate-pulse rounded-2xl bg-muted/50"
        }
        role="status"
      />
    );
  }
  if (error) {
    return (
      <p className="text-sm text-muted-foreground" role="alert">
        产物暂未加载。
        <Button onClick={() => mutate()} size="sm" variant="ghost">
          重试
        </Button>
      </p>
    );
  }
  if (!data?.length) {
    return (
      <div
        className={
          compact
            ? "flex items-center gap-3 border-y border-border px-2 py-6 text-[13px] text-muted-foreground"
            : "flex min-h-60 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-5 py-6 text-center text-[13px] text-muted-foreground"
        }
      >
        <FileText aria-hidden="true" className="size-5 shrink-0" />
        <p>还没有保存的产物</p>
        {!compact && (
          <p className="max-w-60 text-xs leading-6">
            对话中生成并保存的内容，会出现在这里。
          </p>
        )}
      </div>
    );
  }
  return (
    <div
      className={
        compact
          ? "divide-y divide-border/70 border-y border-border/70"
          : "grid gap-3 sm:grid-cols-2"
      }
    >
      {data.slice(0, limit).map((entry) => (
        <button
          aria-label={`打开产物：${entry.title}`}
          className={
            compact
              ? "group/artifact flex min-h-20 w-full min-w-0 items-center gap-3 px-1 py-5 text-left transition-colors hover:bg-[var(--workbench-selection)]"
              : "group/artifact flex min-h-28 min-w-0 items-center gap-4 rounded-2xl border border-border/80 bg-card p-5 text-left shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-ring/40 hover:shadow-[var(--shadow-float)]"
          }
          key={entry.id}
          onClick={() => open(entry)}
          title={entry.title}
          type="button"
        >
          <span
            className={
              compact
                ? "flex h-10 w-9 shrink-0 items-center justify-center text-ring"
                : "flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-ring"
            }
          >
            <FileSymbol className="text-ring" kind={entry.kind} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 break-words text-[13px] font-medium leading-5">
              {entry.title}
            </span>
            <span className="mt-1.5 block text-[11px] text-muted-foreground">
              {artifactTypeLabels[entry.kind]}
            </span>
          </span>
          <ArrowUpRight
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover/artifact:text-ring"
          />
        </button>
      ))}
    </div>
  );
}

// biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes per-entry workspace handlers.
"use client";
import { ArrowUpRight, FileText } from "lucide-react";
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

export function SavedArtifactCards({ recent = false }: { recent?: boolean }) {
  const { data, error, isLoading, mutate } = useSavedArtifacts();
  const open = useOpenSavedArtifact();
  if (recent && !data?.length) {
    return null;
  }
  if (!recent && isLoading) {
    return (
      <div
        aria-label="正在加载成果"
        className="h-32 animate-pulse rounded-2xl bg-muted/50"
        role="status"
      />
    );
  }
  if (!recent && error) {
    return (
      <p className="text-sm text-muted-foreground" role="alert">
        成果暂未加载。
        <Button onClick={() => mutate()} size="sm" variant="ghost">
          重试
        </Button>
      </p>
    );
  }
  if (!data?.length) {
    return (
      <div className="flex min-h-60 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-5 py-6 text-center text-[13px] text-muted-foreground">
        <span className="flex size-10 items-center justify-center rounded-xl bg-secondary">
          <FileText aria-hidden="true" className="size-5" />
        </span>
        <p className="text-foreground">还没有保存的成果</p>
        <p className="max-w-60 text-xs leading-6">
          对话中生成并保存的内容，会出现在这里。
        </p>
      </div>
    );
  }
  const entries = (recent ? data.slice(0, 3) : data).map((entry) => (
    <button
      aria-label={`打开成果：${entry.title}`}
      className={
        recent
          ? "group/artifact flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-md py-2 text-left transition-colors hover:bg-secondary/60"
          : "group/artifact flex min-h-28 min-w-0 items-center gap-4 rounded-2xl border border-border/80 bg-card p-5 text-left shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-ring/40 hover:shadow-[var(--shadow-float)]"
      }
      key={entry.id}
      onClick={() => open(entry)}
      title={entry.title}
      type="button"
    >
      <span
        className={
          recent
            ? "flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary"
            : "flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-ring"
        }
      >
        <FileSymbol className="text-ring" kind={entry.kind} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={
            recent
              ? "block truncate text-sm"
              : "line-clamp-2 break-words text-[13px] font-medium leading-5"
          }
        >
          {entry.title}
        </span>
        {!recent && (
          <span className="mt-1.5 block text-[11px] text-muted-foreground">
            {artifactTypeLabels[entry.kind]}
          </span>
        )}
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover/artifact:text-ring"
      />
    </button>
  ));
  if (recent) {
    return (
      <section
        aria-label="最近成果"
        className="mt-7 border-t border-border pt-4 sm:mt-9"
        data-testid="workspace-home-content"
      >
        <h2 className="mb-1.5 text-[13px] font-medium text-muted-foreground">
          最近成果
        </h2>
        <div className="divide-y divide-border/70">{entries}</div>
      </section>
    );
  }
  return <div className="grid gap-3 sm:grid-cols-2">{entries}</div>;
}

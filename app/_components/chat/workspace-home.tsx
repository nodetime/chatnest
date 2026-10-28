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
import type { ChatHistory } from "./sidebar-history";

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
        aria-label="正在加载成果"
        className="h-20 animate-pulse rounded-xl bg-muted/50"
        role="status"
      />
    );
  }
  if (error) {
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
      <div className="flex min-h-16 items-center gap-3 py-4 text-[13px] text-muted-foreground">
        <FileText className="size-5" />
        还没有保存的成果。
      </div>
    );
  }
  return (
    <div
      className={
        compact ? "divide-y divide-border/70" : "grid gap-3 sm:grid-cols-2"
      }
    >
      {data.slice(0, limit).map((entry) => (
        <button
          aria-label={`打开成果：${entry.title}`}
          className={
            compact
              ? "flex w-full min-w-0 items-center gap-3 py-3 text-left transition-colors hover:bg-secondary/60"
              : "flex min-w-0 items-center gap-3 rounded-xl border border-border/80 bg-card px-4 py-4 text-left transition-colors hover:border-ring/40 hover:bg-accent/30"
          }
          key={entry.id}
          onClick={() => open(entry)}
          type="button"
        >
          <FileSymbol kind={entry.kind} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {entry.title}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {artifactTypeLabels[entry.kind]}
            </span>
          </span>
          <ArrowUpRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </button>
      ))}
    </div>
  );
}

export function WorkspaceHome() {
  const { data, error, mutate } = useSWR<ChatHistory>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history?limit=6`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const router = useRouter();
  return (
    <div
      className="grid items-start gap-8 sm:grid-cols-2"
      data-testid="workspace-home-content"
    >
      <section
        aria-label="最近对话"
        className="min-w-0 space-y-3"
        data-testid="home-recent-grid"
      >
        <h2 className="text-[13px] font-medium text-muted-foreground">
          最近对话
        </h2>
        {error ? (
          <Button onClick={() => mutate()} size="sm" variant="ghost">
            重新加载最近对话
          </Button>
        ) : data?.chats.length ? (
          <div className="divide-y divide-border/70">
            {data.chats.slice(0, 3).map((chat) => (
              <button
                className="flex min-h-16 w-full min-w-0 items-center gap-3 py-3 text-left transition-colors hover:bg-secondary/60"
                key={chat.id}
                onClick={() => router.push(`/chat/${chat.id}`)}
                type="button"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {chat.title}
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                <time className="text-xs text-muted-foreground">
                  {new Date(chat.createdAt).toLocaleDateString("zh-CN", {
                    day: "numeric",
                    month: "numeric",
                  })}
                </time>
              </button>
            ))}
          </div>
        ) : (
          <p className="py-1 text-sm text-muted-foreground">
            开始一段对话，随时回来继续。
          </p>
        )}
      </section>
      <section aria-label="最近成果" className="min-w-0 space-y-3">
        <h2 className="text-[13px] font-medium text-muted-foreground">
          最近成果
        </h2>
        <SavedArtifactCards compact limit={4} />
      </section>
    </div>
  );
}

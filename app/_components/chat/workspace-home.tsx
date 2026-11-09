// biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes per-entry workspace handlers.
"use client";
import {
  ArrowUpRight,
  Clock3,
  FileText,
  FolderOpen,
  MessageSquare,
} from "lucide-react";
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
        className={
          compact
            ? "h-60 animate-pulse rounded-xl bg-muted/50"
            : "h-32 animate-pulse rounded-2xl bg-muted/50"
        }
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
              ? "group/artifact flex min-h-20 w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-secondary/60"
              : "group/artifact flex min-h-28 min-w-0 items-center gap-4 rounded-2xl border border-border/80 bg-card p-5 text-left shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-ring/40 hover:shadow-[var(--shadow-float)]"
          }
          key={entry.id}
          onClick={() => open(entry)}
          title={entry.title}
          type="button"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-ring">
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

export function WorkspaceHome() {
  const { data, error, isLoading, mutate } = useSWR<ChatHistory>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history?limit=6`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const router = useRouter();
  return (
    <div
      className="workspace-home-grid grid gap-4"
      data-testid="workspace-home-content"
    >
      <section
        aria-label="最近对话"
        className="workspace-home-panel min-w-0 space-y-3 rounded-2xl border border-border bg-card/80 p-4"
        data-testid="home-recent-grid"
      >
        <h2 className="flex items-center gap-2 px-2 text-[13px] font-medium text-muted-foreground">
          <Clock3 aria-hidden="true" className="size-3.5" />
          最近对话
        </h2>
        {error ? (
          <Button onClick={() => mutate()} size="sm" variant="ghost">
            重新加载最近对话
          </Button>
        ) : isLoading ? (
          <div
            aria-label="正在加载最近对话"
            className="h-60 animate-pulse rounded-xl bg-muted/50"
            role="status"
          />
        ) : data?.chats.length ? (
          <div className="divide-y divide-border/70">
            {data.chats.slice(0, 3).map((chat) => (
              <button
                className="flex min-h-20 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-secondary/60"
                key={chat.id}
                onClick={() => router.push(`/chat/${chat.id}`)}
                title={chat.title}
                type="button"
              >
                <MessageSquare
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground/70"
                />
                <span className="min-w-0 flex-1 line-clamp-2 break-words text-[13px] font-medium leading-5">
                  {chat.title}
                </span>
                <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {new Date(chat.createdAt).toLocaleDateString("zh-CN", {
                    day: "numeric",
                    month: "numeric",
                  })}
                </time>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex min-h-60 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-5 py-6 text-center text-[13px] text-muted-foreground">
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary">
              <MessageSquare aria-hidden="true" className="size-5" />
            </span>
            <p className="text-foreground">从第一段对话开始</p>
            <p className="max-w-60 text-xs leading-6">
              描述你的目标，之后可以随时回来继续。
            </p>
          </div>
        )}
      </section>
      <section
        aria-label="最近成果"
        className="workspace-home-panel min-w-0 space-y-3 rounded-2xl border border-border bg-card/80 p-4"
      >
        <h2 className="flex items-center gap-2 px-2 text-[13px] font-medium text-muted-foreground">
          <FolderOpen aria-hidden="true" className="size-3.5" />
          最近成果
        </h2>
        <SavedArtifactCards compact limit={3} />
      </section>
    </div>
  );
}

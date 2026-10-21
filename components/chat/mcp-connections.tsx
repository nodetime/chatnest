// biome-ignore-all lint/performance/noJsxPropsBind: Small React Compiler-managed form handlers capture current local draft state.
"use client";
import { Plug } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { refreshConflictMessage } from "@/lib/agent/mcp-settings/editor";
import type {
  ServerProjection,
  SettingsProjection,
} from "@/lib/agent/mcp-settings/types";
import { McpEditor, requestMcp } from "./mcp-editor";

async function readSettings(url: string): Promise<SettingsProjection> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("工具连接设置读取失败，请重试。");
  }
  return response.json();
}
export function McpConnections() {
  const { data, error, isLoading, mutate } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/agent/mcp`,
    readSettings,
    { shouldRetryOnError: false }
  );
  const [deleting, setDeleting] = useState<ServerProjection | null>(null);
  const [editing, setEditing] = useState<ServerProjection | "new" | null>(null),
    [busy, setBusy] = useState<string | null>(null),
    [message, setMessage] = useState("");
  async function refresh() {
    await mutate();
  }
  async function change(server: ServerProjection, action: "delete" | "toggle") {
    if (!data || busy) {
      return;
    }
    setBusy(server.id);
    setMessage("");
    try {
      await requestMcp(
        action === "delete"
          ? { action, id: server.id, revision: data.revision }
          : {
              action,
              enabled: !server.enabled,
              id: server.id,
              revision: data.revision,
            }
      );
      await refresh();
    } catch (failure) {
      setMessage(
        failure instanceof Error ? failure.message : "操作失败，请重试。"
      );
      if (
        failure instanceof Error &&
        "status" in failure &&
        failure.status === 409
      ) {
        setMessage(await refreshConflictMessage(refresh, failure.message));
      }
    } finally {
      setBusy(null);
    }
  }
  const list = data?.servers ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-6 text-muted-foreground">
          管理可供助手使用的外部工具。更改将在下一任务生效。
        </p>
        {data?.configured && !editing && (
          <Button
            className="shrink-0"
            disabled={!!busy}
            onClick={() => {
              setMessage("");
              setEditing("new");
            }}
            size="sm"
          >
            新增连接
          </Button>
        )}
      </div>
      {data && !data.configured && (
        <p className="rounded-lg bg-secondary p-3 text-xs leading-5 text-muted-foreground">
          工具管理尚未开启，请联系管理员完成设置。现有工具仍可使用。
        </p>
      )}
      {!!isLoading && (
        <p className="text-xs text-muted-foreground">正在读取工具连接设置…</p>
      )}
      {!!error && (
        <p className="text-xs text-destructive" role="alert">
          工具连接设置读取失败。
          <button
            className="ml-2 underline"
            onClick={() => mutate()}
            type="button"
          >
            重新读取
          </button>
        </p>
      )}
      {!!message && (
        <p className="text-xs text-destructive" role="alert">
          {message}
        </p>
      )}
      {list.map((server) => (
        <div className="rounded-xl border p-4" key={server.id}>
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Plug className="size-4 shrink-0" />
            <span className="break-all">{server.name}</span>
            <span className="ml-auto rounded-full bg-secondary px-2.5 py-1 text-xs font-normal text-muted-foreground">
              {server.enabled ? "已启用" : "已停用"} ·{" "}
              {server.allowedTools.length} 个开放工具
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {server.source === "file" ? "管理员预设" : "使用前需确认"} ·
            连接状态尚未实时检测
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {server.allowedTools.map((name) => (
              <span
                className="max-w-full break-all rounded-md bg-secondary px-2 py-1 font-mono text-[10px] text-muted-foreground"
                key={name}
              >
                {name}
              </span>
            ))}
          </div>
          {data?.configured && server.source === "managed" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={!!busy || !!editing}
                onClick={() => setEditing(server)}
                size="sm"
                variant="outline"
              >
                编辑
              </Button>
              <Button
                disabled={!!busy || !!editing}
                onClick={() => change(server, "toggle")}
                size="sm"
                variant="ghost"
              >
                {busy === server.id
                  ? "处理中…"
                  : server.enabled
                    ? "停用"
                    : "启用"}
              </Button>
              <Button
                disabled={!!busy || !!editing}
                onClick={() => setDeleting(server)}
                size="sm"
                variant="ghost"
              >
                删除
              </Button>
            </div>
          )}
        </div>
      ))}
      {data && !list.length && (
        <p className="text-sm text-muted-foreground">暂无可用工具连接。</p>
      )}
      {!!editing && !!data && (
        <McpEditor
          existingIds={data.servers.map((server) => server.id)}
          key={editing === "new" ? "new" : editing.id}
          onCancel={() => setEditing(null)}
          onConflict={refresh}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
          revision={data.revision}
          server={editing === "new" ? undefined : editing}
        />
      )}
      <AlertDialog
        onOpenChange={(value) => {
          if (!value) {
            setDeleting(null);
          }
        }}
        open={!!deleting}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除工具连接？</AlertDialogTitle>
            <AlertDialogDescription>
              删除“{deleting?.name}
              ”及其保存的凭据。正在进行的任务不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!busy}
              onClick={() => {
                if (deleting) {
                  change(deleting, "delete");
                }
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

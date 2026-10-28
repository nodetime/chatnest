// biome-ignore-all lint/performance/noJsxPropsBind: Controlled management cards bind stable connection IDs.
"use client";
import { Link2, MoreHorizontal, Plug, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAgentInfo } from "@/app/_hooks/use-agent-info";
import {
  personalMcpEndpoint,
  usePersonalCapabilities,
} from "@/app/_hooks/use-personal-capabilities";
import type { ServerProjection } from "@/server/domain/mcp/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { McpEditor, requestMcp } from "./mcp-editor";
import { PersonalAccessGate } from "./personal-access-gate";

export function PersonalConnections() {
  return (
    <PersonalAccessGate section="connections">
      <PersonalConnectionsContent />
    </PersonalAccessGate>
  );
}

function PersonalConnectionsContent() {
  const { regular, mcp, refresh } = usePersonalCapabilities();
  const { data: agent } = useAgentInfo();
  const [editing, setEditing] = useState<ServerProjection | "new" | null>(null),
    [deleting, setDeleting] = useState<ServerProjection | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function change(server: ServerProjection, action: "toggle" | "delete") {
    if (!mcp.data || pending.current) {
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await requestMcp(
        action === "delete"
          ? { action, id: server.id, revision: mcp.data.revision }
          : {
              action,
              enabled: !server.enabled,
              id: server.id,
              revision: mcp.data.revision,
            },
        undefined,
        personalMcpEndpoint
      );
      if (alive.current) {
        setDeleting(null);
        await refresh();
      }
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "操作失败，请重试。");
        await mcp.mutate();
      }
    } finally {
      pending.current = false;
      if (alive.current) {
        setBusy(false);
      }
    }
  }
  return (
    <section className="space-y-6" data-testid="personal-connections">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">我的连接</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            仅自己可用，连接与密钥不随分享传递。
          </p>
        </div>
        <Button
          disabled={!regular || !mcp.data?.configured || busy}
          onClick={() => setEditing("new")}
          size="sm"
        >
          <Plus className="size-3.5" />
          添加连接
        </Button>
      </div>
      {!!mcp.isLoading && (
        <p className="text-sm text-muted-foreground" role="status">
          正在读取连接…
        </p>
      )}
      {!!(mcp.error || error) && (
        <p className="text-sm text-destructive" role="alert">
          {error || mcp.error.message}
          <Button onClick={() => mcp.mutate()} size="sm" variant="ghost">
            重新读取
          </Button>
        </p>
      )}
      {regular && mcp.data && !mcp.data.configured && (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          个人连接暂未开放，请联系管理员开启。平台工具仍可按授权使用。
        </p>
      )}
      <div className="divide-y divide-border/70 border-y border-border/70">
        {mcp.data?.servers.map((server) => (
          <article className="py-4" key={server.id}>
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-secondary/70 p-2">
                <Plug className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-medium">{server.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {server.allowedTools.length} 个工具 ·{" "}
                  {server.enabled ? "已启用" : "已停用"}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={`${server.name}的操作`}
                    disabled={busy}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(server)}>
                    管理连接
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => change(server, "toggle")}>
                    {server.enabled ? "停用连接" : "启用连接"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setDeleting(server)}
                    variant="destructive"
                  >
                    删除连接
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="mt-2 pl-11 truncate text-xs text-muted-foreground">
              {server.origin}
            </p>
          </article>
        ))}
      </div>
      {regular && mcp.data?.configured && !mcp.data.servers.length && (
        <button
          className="flex w-full items-center gap-3 rounded-xl border border-border/80 bg-card p-5 text-left transition-colors hover:bg-muted/50"
          onClick={() => setEditing("new")}
          type="button"
        >
          <Link2 className="size-5 text-muted-foreground" />
          <span className="text-sm">连接你已有的 MCP 工具服务</span>
          <Plus className="ml-auto size-4 text-muted-foreground" />
        </button>
      )}
      {!!agent?.servers.some((s) => s.source !== "personal") && (
        <section>
          <h2 className="mb-3 text-xs font-medium text-muted-foreground">
            平台提供 · 只读
          </h2>
          <div className="divide-y divide-border/70 border-y border-border/70">
            {agent.servers
              .filter((s) => s.source !== "personal")
              .map((s) => (
                <article className="py-4" key={s.id}>
                  <h3 className="text-sm font-medium">{s.name}</h3>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {s.tools.length} 个工具 ·{" "}
                    {s.status === "configured" ? "已设置" : "暂未就绪"}
                  </p>
                </article>
              ))}
          </div>
        </section>
      )}
      <Dialog
        onOpenChange={(open) => {
          if (!open && !pending.current) {
            setEditing(null);
          }
        }}
        open={!!editing}
      >
        <DialogContent
          className="max-h-[85dvh] overflow-y-auto rounded-2xl sm:max-w-[600px]"
          onEscapeKeyDown={(e) => {
            if (pending.current) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            if (pending.current) {
              e.preventDefault();
            }
          }}
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "添加连接" : "管理连接"}
            </DialogTitle>
            <DialogDescription>
              连接你已有的工具服务，密钥只保存在个人空间。
            </DialogDescription>
          </DialogHeader>
          {!!editing && !!mcp.data && (
            <McpEditor
              endpoint={personalMcpEndpoint}
              existingIds={mcp.data.servers.map((s) => s.id)}
              key={editing === "new" ? "new" : editing.id}
              onBusyChange={(v) => {
                pending.current = v;
                setBusy(v);
              }}
              onCancel={() => setEditing(null)}
              onConflict={async () => {
                await mcp.mutate();
              }}
              onSaved={async () => {
                setEditing(null);
                await refresh();
              }}
              revision={mcp.data.revision}
              server={editing === "new" ? undefined : editing}
            />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        onOpenChange={(v) => {
          if (!v && !pending.current) {
            setDeleting(null);
          }
        }}
        open={!!deleting}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除连接？</AlertDialogTitle>
            <AlertDialogDescription>
              删除“{deleting?.name}
              ”及其密钥。等待中的旧授权将失效，已保存的成果不会删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
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
    </section>
  );
}

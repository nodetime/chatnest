// biome-ignore-all lint/performance/noJsxPropsBind: Small React Compiler-managed form handlers capture current local draft state.
"use client";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import useSWR from "swr";
import { McpEditor, requestMcp } from "@/app/_components/chat/mcp-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/_components/ui/alert-dialog";
import { Button } from "@/app/_components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/_components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/_components/ui/dropdown-menu";
import { Input } from "@/app/_components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/_components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/_components/ui/table";
import { refreshConflictMessage } from "@/server/agent/mcp-settings/editor";
import type {
  ServerProjection,
  SettingsProjection,
} from "@/server/agent/mcp-settings/types";

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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [deleting, setDeleting] = useState<ServerProjection | null>(null);
  const [editing, setEditing] = useState<ServerProjection | "new" | null>(null),
    [busy, setBusy] = useState<string | null>(null),
    [message, setMessage] = useState("");
  const [editorBusy, setEditorBusy] = useState(false);
  const editorBusyRef = useRef(false);
  const changeEditorBusy = useCallback((value: boolean) => {
    // The ref closes the click-to-rerender gap for Escape/outside/close events.
    editorBusyRef.current = value;
    setEditorBusy(value);
  }, []);
  const closeEditor = useCallback(() => {
    if (!editorBusyRef.current) {
      setEditing(null);
    }
  }, []);
  const protectEditor = useCallback((event: { preventDefault: () => void }) => {
    if (editorBusyRef.current) {
      event.preventDefault();
    }
  }, []);
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
  const visible = list.filter(
    (server) =>
      `${server.name} ${server.id} ${server.origin}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()) &&
      (filter === "all" ||
        (filter === "enabled" ? server.enabled : !server.enabled))
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          更改将在下一任务生效。连接配置不代表实时连通。
        </p>
        {data?.configured && !editing && (
          <Button
            disabled={!!busy}
            onClick={() => {
              setMessage("");
              setEditing("new");
            }}
            size="sm"
          >
            <Plus aria-hidden="true" className="size-4" />
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
      <Card>
        <CardHeader className="border-b">
          <CardTitle>连接列表</CardTitle>
          <CardDescription>
            {data ? `${list.length} 个连接 · 最多 8 个` : "正在读取连接"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:max-w-xs">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
              />
              <Input
                aria-label="搜索工具连接"
                className="pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索名称、标识或来源…"
                value={query}
              />
            </div>
            <select
              aria-label="筛选连接状态"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              onChange={(event) => setFilter(event.target.value)}
              value={filter}
            >
              <option value="all">全部状态</option>
              <option value="enabled">已启用</option>
              <option value="disabled">已停用</option>
            </select>
            {(!!query || filter !== "all") && (
              <Button
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                size="sm"
                variant="ghost"
              >
                清除筛选
              </Button>
            )}
          </div>
          <Table aria-label="工具连接列表">
            <TableHeader>
              <TableRow>
                <TableHead>连接名称</TableHead>
                <TableHead>连接类型 / 来源</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>开放工具</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((server) => (
                <TableRow key={server.id}>
                  <TableCell className="min-w-36">
                    <p className="font-medium">{server.name}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {server.id}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p>MCP · HTTP</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {server.source === "file"
                        ? "文件管理 · 只读"
                        : "平台管理"}
                    </p>
                    {!!server.origin && (
                      <p
                        className="mt-1 max-w-64 truncate text-xs text-muted-foreground"
                        title={server.origin}
                      >
                        {server.origin}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                      <span
                        aria-hidden="true"
                        className={`size-1.5 rounded-full ${server.enabled ? "bg-foreground" : "bg-muted-foreground/40"}`}
                      />
                      {server.enabled ? "已启用" : "已停用"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="tabular-nums">
                      {server.allowedTools.length}
                    </span>
                    {!!server.allowedTools.length && (
                      <details className="mt-1 max-w-56 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">查看工具</summary>
                        <p className="mt-2 whitespace-normal break-all font-mono leading-5">
                          {server.allowedTools.join(" · ")}
                        </p>
                      </details>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {data?.configured && server.source === "managed" ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label={`${server.name}的操作`}
                            disabled={!!busy || !!editing}
                            size="icon-sm"
                            variant="ghost"
                          >
                            <MoreHorizontal
                              aria-hidden="true"
                              className="size-4"
                            />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(server)}>
                            编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => change(server, "toggle")}
                          >
                            {server.enabled ? "停用" : "启用"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setDeleting(server)}
                            variant="destructive"
                          >
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        只读
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {data && !visible.length && (
                <TableRow>
                  <TableCell
                    className="h-28 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    {list.length
                      ? "没有匹配的连接，请调整筛选。"
                      : "暂无工具连接，新增连接以开放助手能力。"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            文件管理连接由部署配置维护；平台管理连接支持编辑、启停与删除。
          </p>
        </CardContent>
      </Card>
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            closeEditor();
          }
        }}
        open={!!editing}
      >
        <SheetContent
          aria-busy={editorBusy}
          className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
          onEscapeKeyDown={protectEditor}
          onInteractOutside={protectEditor}
          showCloseButton={!editorBusy}
        >
          <SheetHeader className="border-b">
            <SheetTitle>
              {editing === "new" ? "新增工具连接" : "编辑工具连接"}
            </SheetTitle>
            <SheetDescription>
              连接服务、发现原生工具参数，选择向助手开放的能力。
            </SheetDescription>
          </SheetHeader>
          {!!editing && !!data && (
            <div className="p-5">
              <McpEditor
                existingIds={data.servers.map((server) => server.id)}
                key={editing === "new" ? "new" : editing.id}
                onBusyChange={changeEditorBusy}
                onCancel={closeEditor}
                onConflict={refresh}
                onSaved={async () => {
                  changeEditorBusy(false);
                  setEditing(null);
                  await refresh();
                }}
                revision={data.revision}
                server={editing === "new" ? undefined : editing}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
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

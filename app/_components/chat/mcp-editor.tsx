// biome-ignore-all lint/performance/noJsxPropsBind: Small React Compiler-managed form handlers capture current local draft state.
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { Textarea } from "@/app/_components/ui/textarea";
import {
  authenticationKind,
  bearerValue,
  connectionFingerprint,
  createEditorLifetime,
  newConnectionIdConflict,
  parseHeaderInput,
  refreshConflictMessage,
  suggestServerId,
  withBearer,
} from "@/server/domain/mcp/editor";
import { actionSchema, parseImport } from "@/server/domain/mcp/schema";
import type {
  ConnectionEdit,
  ServerProjection,
  SettingsAction,
  ToolMetadata,
} from "@/server/domain/mcp/types";
export async function requestMcp(
  action: SettingsAction,
  signal?: AbortSignal,
  endpoint = "/api/agent/mcp"
) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${endpoint}`,
    {
      body: JSON.stringify(action),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal,
    }
  );
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error ?? "操作失败，请重试。");
    Object.assign(error, { status: response.status });
    throw error;
  }
  return data;
}
export function McpEditor({
  server,
  revision,
  onSaved,
  onCancel,
  onConflict,
  existingIds,
  onBusyChange,
  endpoint = "/api/agent/mcp",
}: {
  endpoint?: string;
  server?: ServerProjection;
  existingIds: string[];
  revision: number;
  onSaved: () => Promise<void>;
  onCancel: () => void;
  onConflict: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [lifetime] = useState(createEditorLifetime);
  useEffect(() => {
    lifetime.activate();
    return () => lifetime.dispose();
  }, [lifetime]);
  const [id, setId] = useState(server?.id ?? ""),
    [name, setName] = useState(server?.name ?? "");
  const [replace, setReplace] = useState(!server),
    [url, setUrl] = useState(""),
    [headers, setHeaders] = useState("");
  const [enabled, setEnabled] = useState(server?.enabled ?? true),
    [selected, setSelected] = useState<string[]>(server?.allowedTools ?? []);
  const [tools, setTools] = useState<ToolMetadata[]>([]),
    [tested, setTested] = useState<string | null>(null),
    [busy, setBusy] = useState<"test" | "save" | null>(null),
    [error, setError] = useState("");
  const [importText, setImportText] = useState("");
  const [authMode, setAuthMode] = useState<"none" | "bearer" | "custom">(
    "none"
  );
  const [customId, setCustomId] = useState(!!server);
  const [idSuffix] = useState(() =>
    crypto.randomUUID().replaceAll("-", "").slice(0, 6)
  );
  function connection(): ConnectionEdit {
    return replace
      ? { mode: "replace", value: { headers: parseHeaderInput(headers), url } }
      : { mode: "keep" };
  }
  let current: string | null = null;
  try {
    const edit = connection();
    actionSchema.parse({
      action: "test",
      connection: edit,
      id: id || undefined,
    });
    current = connectionFingerprint(id, edit, revision);
  } catch {
    // Invalid header JSON marks this connection unverified until corrected.
  }
  const verified = current !== null && tested === current;
  const duplicateId = newConnectionIdConflict(id, existingIds, !!server);
  async function test() {
    if (busy) {
      return;
    }
    const operation = lifetime.start();
    if (!operation) {
      return;
    }
    const testedRevision = revision;
    onBusyChange?.(true);
    setBusy("test");
    setError("");
    setTested(null);
    try {
      const edit = connection();
      const action = actionSchema.parse({
        action: "test",
        connection: edit,
        id: id || undefined,
      });
      const data = await requestMcp(action, operation.signal, endpoint);
      if (!operation.isCurrent()) {
        return;
      }
      setTools(data.tools);
      setSelected((previous) =>
        previous.filter((toolName) =>
          data.tools.some((tool: ToolMetadata) => tool.name === toolName)
        )
      );
      setTested(connectionFingerprint(id, edit, testedRevision));
    } catch {
      if (!operation.isCurrent()) {
        return;
      }
      setError(
        "测试失败，请检查地址、请求头和服务端允许的来源；未执行任何工具调用。"
      );
    } finally {
      if (operation.finish()) {
        setBusy(null);
        onBusyChange?.(false);
      }
    }
  }
  async function save() {
    if (!verified || busy || duplicateId) {
      return;
    }
    const operation = lifetime.start();
    if (!operation) {
      return;
    }
    onBusyChange?.(true);
    setBusy("save");
    setError("");
    try {
      const action = actionSchema.parse({
        action: "save",
        revision,
        server: {
          allowedTools: selected,
          connection: connection(),
          enabled,
          id,
          name,
        },
      });
      await requestMcp(action, operation.signal, endpoint);
      if (!operation.isCurrent()) {
        return;
      }
      setHeaders("");
      setUrl("");
      setImportText("");
      await onSaved();
    } catch (failure) {
      if (!operation.isCurrent()) {
        return;
      }
      const message =
        failure instanceof Error && "status" in failure
          ? failure.message
          : "保存失败，请检查名称、标识与连接输入。";
      setError(message);
      if (
        failure instanceof Error &&
        "status" in failure &&
        failure.status === 409
      ) {
        // Invalidate before refreshing; failed refresh must not leave old verification reusable.
        setTested(null);
        const conflict = await refreshConflictMessage(async () => {
          if (operation.isCurrent()) {
            await onConflict();
          }
        }, message);
        if (operation.isCurrent()) {
          setError(conflict);
        }
      }
    } finally {
      if (operation.finish()) {
        setBusy(null);
        onBusyChange?.(false);
      }
    }
  }
  function importJson() {
    try {
      const value = parseImport(importText);
      setId(value.id);
      setCustomId(true);
      setAuthMode(authenticationKind(JSON.stringify(value.connection.headers)));
      setName(value.name);
      setUrl(value.connection.url);
      setHeaders(JSON.stringify(value.connection.headers, null, 2));
      setReplace(true);
      setImportText("");
      setTested(null);
      setTools([]);
      setSelected([]);
      setError("");
    } catch {
      setError(
        "导入格式无效：仅支持一个 mcpServers HTTP url + headers 连接（最多 32 KB），不支持 command / args。"
      );
    }
  }
  return (
    <section
      aria-label={server ? "编辑 MCP 连接" : "新增 MCP 连接"}
      className="space-y-4 rounded-xl border p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {server ? "编辑连接" : "新增连接"}
        </h3>
        <Button disabled={!!busy} onClick={onCancel} size="sm" variant="ghost">
          取消
        </Button>
      </div>
      <fieldset className="space-y-3" disabled={!!busy}>
        <label className="block space-y-1.5 text-sm" htmlFor="mcp-name">
          <span>连接名称</span>
          <Input
            autoComplete="off"
            id="mcp-name"
            maxLength={80}
            onChange={(event) => {
              setName(event.target.value);
              if (!customId) {
                setId(suggestServerId(event.target.value, idSuffix));
              }
            }}
            placeholder="例如：网页检索"
            value={name}
          />
        </label>
        {!!server && (
          <div className="space-y-2 rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">
            <p>已保存凭据，无需重复填写。</p>
            <label className="flex items-center gap-2">
              <input
                checked={replace}
                onChange={(event) => {
                  setReplace(event.target.checked);
                  setTested(null);
                  setUrl("");
                  setHeaders("");
                  setAuthMode("none");
                }}
                type="checkbox"
              />
              更换地址或凭据
            </label>
            {!!replace && (
              <p>更换后将替换原地址与全部请求头，不会沿用旧密钥。</p>
            )}
          </div>
        )}
        {!!replace && (
          <>
            <label className="block space-y-1.5 text-sm" htmlFor="mcp-url">
              <span>服务地址</span>
              <Input
                autoComplete="off"
                id="mcp-url"
                maxLength={4096}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://服务地址/mcp"
                type="url"
                value={url}
              />
            </label>
            <label className="block space-y-1.5 text-sm" htmlFor="mcp-auth">
              <span>认证方式</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                id="mcp-auth"
                onChange={(event) => {
                  const mode = event.target.value as typeof authMode;
                  let kind: ReturnType<typeof authenticationKind>;
                  try {
                    kind = authenticationKind(headers);
                  } catch {
                    setError("请先在高级配置中修正请求头格式。");
                    return;
                  }
                  if (mode === "bearer" && kind === "custom") {
                    setError(
                      "当前连接包含自定义请求头，请在高级配置中编辑，以免丢失服务要求的字段。"
                    );
                    return;
                  }
                  setAuthMode(mode);
                  if (mode === "none") {
                    setHeaders("");
                  }
                }}
                value={authMode}
              >
                <option value="none">无需认证（不发送自定义请求头）</option>
                <option value="bearer">Bearer 密钥</option>
                <option value="custom">自定义请求头</option>
              </select>
            </label>
            {authMode === "bearer" && (
              <label className="block space-y-1.5 text-sm" htmlFor="mcp-key">
                <span>访问密钥</span>
                <Input
                  autoComplete="off"
                  id="mcp-key"
                  maxLength={4089}
                  onChange={(event) =>
                    setHeaders(withBearer(headers, event.target.value))
                  }
                  placeholder="输入服务提供的密钥"
                  type="password"
                  value={bearerValue(headers)}
                />
              </label>
            )}
            {authMode === "custom" && (
              <p className="text-xs text-muted-foreground">
                在下方“高级配置”填写服务要求的完整请求头；导入的字段已全部保留。
              </p>
            )}
          </>
        )}
        {!!duplicateId && (
          <p className="text-xs text-destructive" role="alert">
            连接标识已存在，请编辑原连接或在高级配置中更换标识。
          </p>
        )}
        <details
          className="rounded-lg border p-3 text-xs text-muted-foreground"
          open={duplicateId || undefined}
        >
          <summary className="cursor-pointer">高级配置</summary>
          <div className="mt-3 space-y-3">
            <label className="block space-y-1.5" htmlFor="mcp-id">
              <span>内部标识（已自动生成）</span>
              <Input
                autoComplete="off"
                disabled={!!server}
                id="mcp-id"
                maxLength={31}
                onChange={(event) => {
                  setId(event.target.value);
                  setCustomId(true);
                }}
                value={id}
              />
            </label>
            {!!server && (
              <p className="break-all">
                来源：{server.origin} · 已保存请求头：
                {server.headerNames.join(", ") || "无"}
              </p>
            )}
            {!!replace && authMode === "custom" && (
              <label className="block space-y-1.5" htmlFor="mcp-headers">
                <span>完整请求头 JSON（替换全部，不合并旧值）</span>
                <Textarea
                  autoComplete="off"
                  className="font-mono text-xs"
                  id="mcp-headers"
                  maxLength={32_768}
                  onChange={(event) => {
                    setHeaders(event.target.value);
                    setAuthMode("custom");
                  }}
                  placeholder={'{"Authorization":"Bearer TOKEN"}'}
                  spellCheck={false}
                  value={headers}
                />
              </label>
            )}
            {!server && (
              <>
                <label className="block space-y-1.5" htmlFor="mcp-import">
                  <span>导入 MCP JSON（仅填表）</span>
                  <Textarea
                    autoComplete="off"
                    className="font-mono text-xs"
                    id="mcp-import"
                    maxLength={32_768}
                    onChange={(event) => setImportText(event.target.value)}
                    placeholder={
                      '{"mcpServers":{"my_service":{"url":"https://HOST/mcp","headers":{}}}}'
                    }
                    value={importText}
                  />
                </label>
                <Button
                  disabled={!!busy || !importText}
                  onClick={importJson}
                  size="sm"
                  variant="outline"
                >
                  导入到表单
                </Button>
              </>
            )}
          </div>
        </details>
        <label className="flex items-center gap-2 text-xs">
          <input
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            type="checkbox"
          />
          启用连接
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!!busy || current === null}
          onClick={test}
          size="sm"
          variant="outline"
        >
          {busy === "test" ? "正在测试…" : "测试连接"}
        </Button>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {busy === "test"
            ? "正在测试"
            : verified
              ? `测试成功 · 发现 ${tools.length} 个工具`
              : error
                ? "测试或保存失败"
                : "尚未测试"}
        </span>
      </div>
      {!!verified && (
        <fieldset className="space-y-2" disabled={!!busy}>
          <legend className="mb-2 text-xs font-medium">
            选择可使用的工具（使用前需确认）
          </legend>
          {tools.map((tool) => (
            <label
              className="flex items-start gap-2 rounded-lg bg-secondary/40 p-2 text-xs"
              key={tool.name}
            >
              <input
                checked={selected.includes(tool.name)}
                className="mt-0.5"
                onChange={(event) =>
                  setSelected((previous) =>
                    event.target.checked
                      ? [...previous, tool.name]
                      : previous.filter((toolName) => toolName !== tool.name)
                  )
                }
                type="checkbox"
              />
              <span className="min-w-0">
                <span className="break-all font-mono">{tool.name}</span>
                {!!tool.description && (
                  <span className="mt-1 block break-words text-muted-foreground">
                    {tool.description}
                  </span>
                )}
              </span>
            </label>
          ))}
          {!tools.length && (
            <p className="text-xs text-muted-foreground">
              该连接没有返回工具。
            </p>
          )}
        </fieldset>
      )}
      {!!error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <details className="text-xs leading-5 text-muted-foreground">
        <summary className="cursor-pointer">关于连接测试与密钥</summary>
        <p className="mt-2">
          测试只读取工具列表，不执行工具。发现成功不代表服务额度或套餐已开通。密钥加密保存在服务端，不回传浏览器或进入聊天。保存前会再次核验工具。
        </p>
      </details>
      <Button
        disabled={!!busy || !verified || !name.trim() || !id || duplicateId}
        onClick={save}
        size="sm"
      >
        {busy === "save" ? "正在核验并保存…" : "保存连接"}
      </Button>
    </section>
  );
}

// biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes this local form; per-row handlers capture the current editable row.
// biome-ignore-all lint/suspicious/noArrayIndexKey: Draft IDs are editable and may be empty; rows carry no independent state.
"use client";
import { CheckCircle2, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ModelConfiguration,
  ModelSettingsProjection,
} from "@/lib/ai/model-settings/schema";

const prefix = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const endpoint = `${prefix}/api/admin/models`;
async function load(url: string): Promise<ModelSettingsProjection> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "读取模型配置失败。");
  }
  return body;
}
export function AdminModels() {
  const {
    data,
    error,
    mutate: refresh,
  } = useSWR(endpoint, load, { revalidateOnFocus: false });
  const [draft, setDraft] = useState<ModelConfiguration | null>(null);
  const [key, setKey] = useState("");
  const [replaceKey, setReplaceKey] = useState(false);
  const [revision, setRevision] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [busy, setBusy] = useState<"save" | "test" | "models" | null>(null);
  const pending = useRef(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const config = draft ?? data?.config;
  function change(next: ModelConfiguration) {
    setDraft(next);
    setRevision(revision ?? data?.revision ?? 0);
    setNotice(null);
  }
  async function action(kind: "save" | "test" | "models") {
    if (!config || !data || pending.current) {
      return;
    }
    pending.current = true;
    setBusy(kind);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({
          action: kind,
          config,
          key:
            replaceKey || !data.hasKey
              ? { mode: "replace", value: key }
              : { mode: "keep" },
          revision: revision ?? data.revision,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "操作失败，请重试。");
      }
      if (kind === "models") {
        setCatalog(result.models ?? []);
        setNotice({ ok: result.ok, text: result.message });
      }
      if (kind === "test") {
        setNotice({
          ok: result.ok,
          text: `${result.message}${result.status ? `（HTTP ${result.status}）` : ""}${result.latencyMs ? ` · ${(result.latencyMs / 1000).toFixed(1)} 秒` : ""}`,
        });
      }
      if (kind === "save") {
        setKey("");
        setReplaceKey(false);
        setRevision(result.revision);
        setNotice({
          ok: true,
          text: "已保存，新请求将使用此配置。保存不等于连接测试通过。",
        });
        await refresh();
        await Promise.all([
          mutate(`${prefix}/api/models`),
          mutate(`${prefix}/api/agent`),
          mutate(`${prefix}/api/admin/overview`),
        ]);
      }
    } catch (e) {
      setNotice({
        ok: false,
        text: e instanceof Error ? e.message : "操作失败。",
      });
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }
  if (error) {
    return (
      <div className="space-y-3 rounded-lg border p-5" role="alert">
        <p>模型配置读取失败，请重试。</p>
        <Button onClick={() => refresh()} variant="outline">
          重新加载
        </Button>
      </div>
    );
  }
  if (!config || !data) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        正在读取模型配置…
      </p>
    );
  }
  const changedEndpoint =
    config.baseURL.replace(/\/+$/, "") !== data.config.baseURL;
  const needsKey = !data.hasKey || replaceKey || changedEndpoint;
  const ready = data.manageable && (!needsKey || !!key.trim());
  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-5 py-4">
        <div>
          <p className="text-sm font-medium">
            {data.source === "managed" ? "后台管理" : "环境配置"}{" "}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {data.configured ? "已配置 · 连接待实际测试" : "尚未配置"}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.source === "environment"
              ? "当前读取服务端环境；保存后由后台配置接管，不修改 .env。"
              : "密钥加密保存，仅服务器调用模型时使用。"}
          </p>
        </div>
        <Button
          disabled={!!busy}
          onClick={async () => {
            setDraft(null);
            setKey("");
            setRevision(null);
            setReplaceKey(false);
            setNotice(null);
            setCatalog([]);
            await refresh();
          }}
          size="sm"
          variant="ghost"
        >
          <RefreshCw className="mr-2 size-4" />
          重新载入
        </Button>
      </div>
      {!data.manageable && (
        <p className="rounded-lg border p-4 text-sm" role="alert">
          请由部署管理员配置数据库和平台加密主密钥；模型地址与 Key
          随后可在此管理。
        </p>
      )}
      <fieldset
        className="space-y-6 disabled:opacity-70"
        disabled={!!busy || !data.manageable}
      >
        <Card>
          <CardHeader>
            <CardTitle>连接服务</CardTitle>
            <CardDescription>
              OpenAI 或兼容接口。地址与 Key 必须来自同一服务商。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="model-base-url">API 基础地址</Label>
              <Input
                autoComplete="off"
                id="model-base-url"
                onChange={(e) => {
                  change({ ...config, baseURL: e.target.value });
                  setCatalog([]);
                }}
                placeholder="https://api.openai.com/v1"
                value={config.baseURL}
              />
              <p className="text-xs text-muted-foreground">
                包含 /v1 等服务路径，不包含 /chat/completions 或 /responses。
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="model-protocol">接口协议</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  id="model-protocol"
                  onChange={(e) =>
                    change({
                      ...config,
                      apiMode: e.target.value as "chat" | "responses",
                    })
                  }
                  value={config.apiMode}
                >
                  <option value="chat">Chat Completions（兼容性优先）</option>
                  <option value="responses">Responses</option>
                </select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="model-key">API Key</Label>
                  {data.hasKey && !changedEndpoint && (
                    <button
                      className="text-xs underline underline-offset-4"
                      onClick={() => {
                        setReplaceKey(!replaceKey);
                        setKey("");
                        setNotice(null);
                      }}
                      type="button"
                    >
                      {replaceKey ? "保留现有 Key" : "更换 Key"}
                    </button>
                  )}
                </div>
                <Input
                  autoComplete="new-password"
                  disabled={!needsKey || !!busy}
                  id="model-key"
                  onChange={(e) => {
                    setKey(e.target.value);
                    setReplaceKey(true);
                    setNotice(null);
                  }}
                  placeholder={
                    needsKey ? "输入此服务对应的 Key" : "已保存 · 不回显"
                  }
                  type="password"
                  value={key}
                />
                <p className="text-xs text-muted-foreground">
                  {changedEndpoint
                    ? "地址已改变，请重新输入对应 Key，避免混用凭据。"
                    : "留在保留模式即可沿用；不会在页面、导出或响应中显示。"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1.5">
                <CardTitle>开放模型</CardTitle>
                <CardDescription>
                  用户只能选择下列模型。工具调用和图片理解按供应商能力设置。
                </CardDescription>
              </div>
              <Button
                disabled={!ready || !!busy}
                onClick={() => action("models")}
                size="sm"
                variant="outline"
              >
                {busy === "models" && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                获取模型目录
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <datalist id="provider-model-catalog">
              {catalog.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-3 font-medium">模型 ID</th>
                    <th className="px-3 font-medium">默认</th>
                    <th className="px-3 font-medium">工具</th>
                    <th className="px-3 font-medium">图片</th>
                    <th>
                      <span className="sr-only">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {config.models.map((model, index) => (
                    <tr className="border-b last:border-0" key={index}>
                      <td className="min-w-48 py-3">
                        <Input
                          aria-label={`模型 ${index + 1} ID`}
                          list="provider-model-catalog"
                          onChange={(e) =>
                            change({
                              ...config,
                              defaultModel:
                                config.defaultModel === model.id
                                  ? e.target.value
                                  : config.defaultModel,
                              models: config.models.map((m, i) =>
                                i === index ? { ...m, id: e.target.value } : m
                              ),
                            })
                          }
                          value={model.id}
                        />
                      </td>
                      <td className="px-3">
                        <input
                          aria-label={`默认模型 ${index + 1}`}
                          checked={config.defaultModel === model.id}
                          name="default-model"
                          onChange={() =>
                            change({ ...config, defaultModel: model.id })
                          }
                          type="radio"
                        />
                      </td>
                      <td className="px-3">
                        <input
                          aria-label={`模型 ${index + 1} 支持工具`}
                          checked={model.tools}
                          onChange={(e) =>
                            change({
                              ...config,
                              models: config.models.map((m, i) =>
                                i === index
                                  ? { ...m, tools: e.target.checked }
                                  : m
                              ),
                            })
                          }
                          type="checkbox"
                        />
                      </td>
                      <td className="px-3">
                        <input
                          aria-label={`模型 ${index + 1} 支持图片`}
                          checked={model.vision}
                          onChange={(e) =>
                            change({
                              ...config,
                              models: config.models.map((m, i) =>
                                i === index
                                  ? { ...m, vision: e.target.checked }
                                  : m
                              ),
                            })
                          }
                          type="checkbox"
                        />
                      </td>
                      <td className="pl-2">
                        <Button
                          aria-label={`移除模型 ${index + 1}`}
                          disabled={config.models.length === 1}
                          onClick={() => {
                            const models = config.models.filter(
                              (_, i) => i !== index
                            );
                            change({
                              ...config,
                              defaultModel:
                                config.defaultModel === model.id
                                  ? models[0].id
                                  : config.defaultModel,
                              models,
                            });
                          }}
                          size="icon"
                          variant="ghost"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              disabled={config.models.length >= 32}
              onClick={() =>
                change({
                  ...config,
                  models: [
                    ...config.models,
                    { id: "", tools: true, vision: false },
                  ],
                })
              }
              size="sm"
              variant="ghost"
            >
              <Plus className="mr-2 size-4" />
              添加模型
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">
              模型 ID
              保持服务商原名；目录接口不可用时可手动填写。勾选能力仅用于开放功能，不代表已通过验证。
            </p>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-xl text-xs leading-5 text-muted-foreground">
            测试默认模型的实际文本响应，可能产生少量供应商费用。测试不会保存配置，也不会自动调用业务工具。
          </p>
          <div className="flex gap-2">
            <Button
              disabled={!ready || !!busy}
              onClick={() => action("test")}
              variant="outline"
            >
              {busy === "test" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              测试连接
            </Button>
            <Button disabled={!ready || !!busy} onClick={() => action("save")}>
              {busy === "save" && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              保存配置
            </Button>
          </div>
        </div>
      </fieldset>
      {notice !== null && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-4 text-sm ${notice.ok ? "bg-muted/30" : "border-destructive/30 text-destructive"}`}
          role={notice.ok ? "status" : "alert"}
        >
          {notice.ok === true && (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          )}
          {notice.text}
        </div>
      )}
    </div>
  );
}

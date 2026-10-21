"use client";
import { HardDrive, Image, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import useSWR, { mutate } from "swr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Status = {
  enabled: boolean;
  revision: number;
  configured: boolean;
  driver: string;
  formats: string[];
  maxFileBytes: number;
  maxImages: number;
  maxContextBytes: number;
};
const endpoint = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/storage`;
async function load(url: string): Promise<Status> {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "读取存储状态失败。");
  }
  return body;
}
export function AdminStorage() {
  const {
    data,
    error,
    mutate: refresh,
  } = useSWR(endpoint, load, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const action = useCallback(
    async (kind: "test" | "configure" | "cleanup") => {
      setBusy(true);
      setNotice("");
      try {
        const response = await fetch(endpoint, {
          body: JSON.stringify({
            action: kind,
            ...(kind === "configure"
              ? { enabled: !data?.enabled, revision: data?.revision }
              : {}),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? "存储操作失败。");
        }
        setNotice(
          kind === "test"
            ? "连接测试成功：私有写入、原字节读取和删除均通过。"
            : kind === "cleanup"
              ? "已尝试清理过期草稿和待删除文件。"
              : body.enabled
                ? "图片上传已开启。"
                : "新上传已关闭；已发送附件仍按会话权限读取。"
        );
        await refresh();
        await mutate(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/agent`);
      } catch (actionError) {
        setNotice(
          actionError instanceof Error ? actionError.message : "存储操作失败。"
        );
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [data?.enabled, data?.revision, refresh]
  );
  const testConnection = useCallback(() => action("test"), [action]);
  const configure = useCallback(() => action("configure"), [action]);
  const cleanup = useCallback(() => action("cleanup"), [action]);
  const retry = useCallback(() => {
    refresh();
  }, [refresh]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <p className="text-sm font-medium">图片上传</p>
          <p className="mt-1 text-xs text-muted-foreground">
            关闭新上传不会撤销已发送的附件。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !data}
            onClick={testConnection}
            size="sm"
            variant="outline"
          >
            测试连接
          </Button>
          <Button
            disabled={busy || !data || (!data.configured && !data.enabled)}
            onClick={configure}
            size="sm"
          >
            {data?.enabled ? "关闭新上传" : "开启图片上传"}
          </Button>
        </div>
      </div>
      {!!error && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 p-4"
          role="alert"
        >
          <p className="text-sm text-destructive">{error.message}</p>
          <Button onClick={retry} size="sm" variant="outline">
            <RefreshCw aria-hidden="true" className="size-4" />
            重新读取
          </Button>
        </div>
      )}
      {!!notice && (
        <p
          aria-live="polite"
          className="rounded-lg border bg-muted/30 p-4 text-sm"
          role="status"
        >
          {notice}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              本地存储
            </CardTitle>
            <CardDescription>持久化本地目录 · 私有访问</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              <div className="flex items-center justify-between gap-4 pb-4">
                <dt className="text-muted-foreground">新上传状态</dt>
                <dd className="rounded-md border px-2 py-1 text-xs">
                  {data
                    ? data.enabled
                      ? "已开启"
                      : "已关闭"
                    : error
                      ? "读取失败"
                      : "正在读取…"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-4">
                <dt className="text-muted-foreground">目录与配额配置</dt>
                <dd>{data ? (data.configured ? "已配置" : "待配置") : "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 pt-4">
                <dt className="text-muted-foreground">访问方式</dt>
                <dd>登录后按会话权限读取</dd>
              </div>
            </dl>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              配置状态不等于实际读写成功。测试连接会执行私有写入、原字节读取和删除。
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              支持格式与限制
            </CardTitle>
            <CardDescription>保留原图及 SHA-256，不公开发布</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              <div className="flex items-center justify-between gap-4 pb-4">
                <dt className="text-muted-foreground">图片格式</dt>
                <dd>JPEG / PNG</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-4">
                <dt className="text-muted-foreground">单张图片</dt>
                <dd>{data ? `${data.maxFileBytes / 1_048_576} MiB` : "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-4">
                <dt className="text-muted-foreground">单条消息</dt>
                <dd>{data ? `${data.maxImages} 张图片` : "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 pt-4">
                <dt className="text-muted-foreground">会话上下文</dt>
                <dd>
                  {data ? `${data.maxContextBytes / 1_048_576} MiB` : "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>文件维护</CardTitle>
          <CardDescription>清理过期的未发送草稿与待删除文件。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            未发送草稿保留 24 小时，清理按小批次执行。
          </p>
          <Button
            disabled={busy || !data}
            onClick={cleanup}
            size="sm"
            variant="outline"
          >
            清理过期草稿
          </Button>
        </CardContent>
      </Card>
      <details className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          部署要求与访问规则
        </summary>
        <div className="mt-4 max-w-4xl space-y-3 leading-6">
          <p>
            服务需在长驻 Node 服务器运行。UPLOAD_STORAGE_DIR
            应为绝对路径，挂载持久化磁盘且仅应用进程可读写；不适用于无持久化磁盘的临时运行环境。生产环境不使用临时目录。
          </p>
          <p>
            默认用户配额 100 MiB、部署配额 1
            GiB，可通过服务端环境变量调整。存储路径由服务器运维环境管理，不在浏览器保存凭据。
          </p>
          <p>
            未发送图片仅上传者可见。发送后跟随会话当前权限；公开转私有立即停止其他用户读取。关闭上传不撤销已发送附件。当前不支持
            PDF、Word 或 Excel。
          </p>
        </div>
      </details>
    </div>
  );
}

"use client";
import { useCallback, useState } from "react";
import useSWR, { mutate } from "swr";
import { Button } from "@/components/ui/button";

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
  return (
    <section className="space-y-6 rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">私有图片存储</h2>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs">
          {data ? (data.enabled ? "已开启" : "已关闭") : "正在读取"}
        </span>
      </div>
      {!!error && (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      )}
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">驱动</dt>
          <dd className="mt-1">持久化本地目录 · 私有访问</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">部署配置</dt>
          <dd className="mt-1">
            {data?.configured
              ? "目录与配额配置有效"
              : "需配置绝对路径 UPLOAD_STORAGE_DIR"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">当前支持</dt>
          <dd className="mt-1">JPEG / PNG，保留原图及 SHA-256</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">大小限制</dt>
          <dd className="mt-1">
            每张 5 MiB · 每条消息 15 张 · 会话上下文 20 MiB
          </dd>
        </div>
      </dl>
      <p className="text-sm leading-6 text-muted-foreground">
        图片仅通过登录后的会话权限访问，原图不会被公开发布。
      </p>
      <details className="space-y-3 text-sm text-muted-foreground">
        <summary className="cursor-pointer text-foreground">
          部署要求与访问规则
        </summary>
        <p className="mt-3 leading-6">
          服务需在长驻 Node 服务器运行，UPLOAD_STORAGE_DIR
          应为绝对路径，挂载持久化磁盘且仅应用进程可读写。默认用户配额 100
          MiB、部署配额 1
          GiB，可通过服务端环境变量调整。连接测试实际写入、读取并删除私有文件；生产环境不使用临时目录。
        </p>
        <p className="leading-6">
          未发送图片仅上传者可见。发送后跟随会话当前权限；公开转私有立即停止其他用户读取。关闭上传不撤销已发送附件。未发送草稿保留
          24 小时，清理按小批次执行。当前不支持 PDF、Word 或 Excel。
        </p>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !data}
          onClick={testConnection}
          variant="outline"
        >
          测试连接
        </Button>
        <Button
          disabled={busy || !data || (!data.configured && !data.enabled)}
          onClick={configure}
        >
          {data?.enabled ? "关闭新上传" : "开启图片上传"}
        </Button>
        <Button disabled={busy || !data} onClick={cleanup} variant="ghost">
          清理过期草稿
        </Button>
      </div>
      {!!notice && (
        <p aria-live="polite" className="text-sm" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

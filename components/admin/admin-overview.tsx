"use client";
import { ArrowRight, Bot, HardDrive, Plug, RotateCw } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminOverviewData } from "@/lib/admin/overview-types";

const endpoint = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/overview`;
async function load(url: string): Promise<AdminOverviewData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("概览读取失败，请刷新重试。");
  }
  return response.json();
}
export function AdminOverview() {
  const { data, error, isLoading, mutate } = useSWR(endpoint, load, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const refresh = useCallback(() => {
    mutate();
  }, [mutate]);
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">平台概览</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            查看助手基础能力的配置状态。
          </p>
        </div>
        <Button
          disabled={isLoading}
          onClick={refresh}
          size="sm"
          variant="outline"
        >
          <RotateCw aria-hidden="true" className="size-4" />
          刷新状态
        </Button>
      </div>
      {!!error && (
        <p
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
          role="alert"
        >
          {error.message}
        </p>
      )}
      <div className="grid items-stretch gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              工具连接
            </CardTitle>
            <CardDescription>MCP 服务与开放工具</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            {data ? (
              data.tools.ok ? (
                <>
                  <p className="text-3xl font-semibold tabular-nums">
                    {data.tools.value.enabled}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      / {data.tools.value.total} 已启用连接
                    </span>
                  </p>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-muted-foreground">配置就绪</dt>
                      <dd className="mt-1 font-medium">
                        {data.tools.value.configured} 个
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">开放工具</dt>
                      <dd className="mt-1 font-medium">
                        {data.tools.value.openTools} 个
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    管理配置
                    {data.tools.value.managementConfigured
                      ? "已就绪"
                      : "尚未开启"}
                    。配置就绪不等于实时连通；可在连接编辑中测试。
                  </p>
                </>
              ) : (
                <CardFailure message={data.tools.error} onRetry={refresh} />
              )
            ) : (
              <p aria-live="polite" className="text-sm text-muted-foreground">
                {error ? "状态未读取" : "正在读取配置…"}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Link
              className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
              href="/admin/connections"
            >
              管理工具连接
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              文件存储
            </CardTitle>
            <CardDescription>私有本地图片存储</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            {data ? (
              data.storage.ok ? (
                <>
                  <p className="text-2xl font-semibold">
                    {data.storage.value.enabled
                      ? "新上传已开启"
                      : "新上传已关闭"}
                  </p>
                  <dl className="text-sm">
                    <dt className="text-muted-foreground">本地目录配置</dt>
                    <dd className="mt-1 font-medium">
                      {data.storage.value.configured ? "已配置" : "待配置"}
                    </dd>
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    支持 JPEG / PNG。实际读写状态请运行存储测试。
                  </p>
                </>
              ) : (
                <CardFailure message={data.storage.error} onRetry={refresh} />
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                {error ? "状态未读取" : "正在读取配置…"}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Link
              className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
              href="/admin/storage"
            >
              管理文件存储
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              默认模型
            </CardTitle>
            <CardDescription>服务端配置 · 只读</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            {data ? (
              data.model.ok ? (
                <>
                  <p className="break-all text-2xl font-semibold">
                    {data.model.value.name}
                  </p>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-muted-foreground">提供方</dt>
                      <dd className="mt-1 font-medium">
                        {data.model.value.provider}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">凭据配置</dt>
                      <dd className="mt-1 font-medium">
                        {data.model.value.configured ? "已配置" : "待配置"}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    仅表示凭据配置状态，未验证连通性或额度。
                  </p>
                </>
              ) : (
                <CardFailure message={data.model.error} onRetry={refresh} />
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                {error ? "状态未读取" : "正在读取配置…"}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              由部署环境管理，模型选择仍在工作台。
            </p>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}
function CardFailure({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-destructive" role="alert">
        {message}
      </p>
      <Button onClick={onRetry} size="sm" variant="outline">
        重新读取
      </Button>
    </div>
  );
}

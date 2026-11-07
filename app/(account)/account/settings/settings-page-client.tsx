"use client";

import { Download, LogOut, RefreshCw, Save, Trash2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { accountErrorMessage } from "@/app/_components/account/account-error";
import { Badge } from "@/app/_components/ui/badge";
import { Button } from "@/app/_components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/_components/ui/card";
import { Input } from "@/app/_components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/_components/ui/select";
import { Textarea } from "@/app/_components/ui/textarea";

type Settings = {
  account: {
    email: string;
    emailVerified: boolean;
    name: string | null;
  };
  deletionRequest: {
    id: string;
    reason: string | null;
    requestedAt: string;
    status: "cancelled" | "completed" | "requested";
  } | null;
  preferences: {
    defaultModelId: string | null;
    emailNotifications: boolean;
    revision: number;
  };
};

type ModelOption = { id: string; name: string };

async function readResponse(response: Response) {
  const payload = (await response.json()) as Settings & { code?: string };
  if (!response.ok) {
    throw new Error(payload.code || "设置操作失败");
  }
  return payload;
}

export function SettingsPageClient({
  models,
  user,
}: {
  models: ModelOption[];
  user: { email: string; name: string | null };
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState(user.name ?? "");
  const [defaultModelId, setDefaultModelId] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [deletionConfirm, setDeletionConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/settings", {
        cache: "no-store",
      });
      const payload = await readResponse(response);
      setSettings(payload);
      setName(payload.account.name ?? "");
      setDefaultModelId(
        payload.preferences.defaultModelId ?? "__deployment_default__"
      );
      setEmailNotifications(payload.preferences.emailNotifications);
      setReason(payload.deletionRequest?.reason ?? "");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? accountErrorMessage(error.message, "设置读取失败，请稍后刷新。")
          : "设置读取失败，请稍后刷新。"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const refresh = useCallback(() => {
    load().catch(() => undefined);
  }, [load]);
  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
    []
  );
  const handleEmailNotificationsChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setEmailNotifications(event.target.checked),
    []
  );
  const handleReasonChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value),
    []
  );
  const handleSignOut = useCallback(() => {
    signOut({ redirectTo: "/" });
  }, []);
  const revokeAllSessions = useCallback(async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/sessions/revoke", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { code?: string };
      if (!response.ok) {
        throw new Error(payload.code || "SESSION_REVOKE_UNAVAILABLE");
      }
      await signOut({ redirectTo: "/login" });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? accountErrorMessage(error.message, "会话撤销失败，请稍后重试。")
          : "会话撤销失败，请稍后重试。"
      );
      setRevokeConfirm(false);
      setSaving(false);
    }
  }, []);
  const requestRevokeConfirmation = useCallback(() => {
    setRevokeConfirm(true);
  }, []);
  const cancelRevokeConfirmation = useCallback(() => {
    setRevokeConfirm(false);
  }, []);
  const requestDeletionConfirmation = useCallback(() => {
    setDeletionConfirm(true);
  }, []);
  const cancelDeletionConfirmation = useCallback(() => {
    setDeletionConfirm(false);
  }, []);

  const saveProfile = useCallback(async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/settings", {
        body: JSON.stringify({ profile: { name: name.trim() || null } }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      setSettings(await readResponse(response));
      setMessage("资料已保存");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? accountErrorMessage(error.message, "资料保存失败，请稍后重试。")
          : "资料保存失败，请稍后重试。"
      );
    } finally {
      setSaving(false);
    }
  }, [name]);

  const savePreferences = useCallback(async () => {
    if (!settings) {
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/settings", {
        body: JSON.stringify({
          preferences: {
            defaultModelId:
              defaultModelId === "__deployment_default__"
                ? null
                : defaultModelId,
            emailNotifications,
            expectedRevision: settings.preferences.revision,
          },
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      setSettings(await readResponse(response));
      setMessage("偏好已保存");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? accountErrorMessage(error.message, "偏好保存失败，请稍后重试。")
          : "偏好保存失败，请稍后重试。"
      );
    } finally {
      setSaving(false);
    }
  }, [defaultModelId, emailNotifications, settings]);

  const requestDeletion = useCallback(async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/deletion-request", {
        body: JSON.stringify({ confirm: "DELETE", reason }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setSettings(await readResponse(response));
      setDeletionConfirm(false);
      setMessage("删除申请已记录，账户数据不会立即删除");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? accountErrorMessage(error.message, "删除申请失败，请稍后重试。")
          : "删除申请失败，请稍后重试。"
      );
    } finally {
      setSaving(false);
    }
  }, [reason]);

  const cancelDeletion = useCallback(async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/deletion-request", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("删除申请撤回失败");
      }
      await load();
      setMessage("删除申请已撤回");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? accountErrorMessage(error.message, "删除申请撤回失败，请稍后重试。")
          : "删除申请撤回失败，请稍后重试。"
      );
    } finally {
      setSaving(false);
    }
  }, [load]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 lg:p-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">账户设置</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            管理个人资料、回答偏好和数据请求；角色、价格和钱包不在这里修改。
          </p>
        </div>
        <Button disabled={loading} onClick={refresh} variant="outline">
          <RefreshCw className="size-4" /> 刷新
        </Button>
      </div>
      {message ? (
        <p
          className="rounded-lg border border-border/70 bg-muted/40 p-3 text-sm"
          role="status"
        >
          {message}
        </p>
      ) : null}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>个人资料</CardTitle>
            <CardDescription>登录邮箱只读，展示名称可以修改。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="block space-y-2 text-sm">
              <span className="font-medium">邮箱</span>
              <Input
                aria-label="邮箱"
                disabled
                id="account-email"
                value={settings?.account.email ?? user.email}
              />
            </div>
            <div className="block space-y-2 text-sm">
              <label className="font-medium" htmlFor="account-name">
                展示名称
              </label>
              <Input
                id="account-name"
                maxLength={80}
                onChange={handleNameChange}
                value={name}
              />
            </div>
            <Button disabled={saving || loading} onClick={saveProfile}>
              <Save className="size-4" /> 保存资料
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>回答设置</CardTitle>
            <CardDescription>
              选择默认回答方式；这些设置只影响你的个人体验。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="block space-y-2 text-sm">
              <label className="font-medium" htmlFor="account-default-model">
                默认回答模型
              </label>
              <Select onValueChange={setDefaultModelId} value={defaultModelId}>
                <SelectTrigger className="w-full" id="account-default-model">
                  <SelectValue placeholder="使用部署默认模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__deployment_default__">
                    使用部署默认模型
                  </SelectItem>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 border-t border-border/70 pt-4">
              <p className="text-sm font-medium">通知</p>
              <label className="flex items-center gap-3 text-sm">
                <input
                  checked={emailNotifications}
                  onChange={handleEmailNotificationsChange}
                  type="checkbox"
                />
                接收产品通知邮件
              </label>
            </div>
            <Button
              disabled={saving || loading || !settings}
              onClick={savePreferences}
            >
              <Save className="size-4" /> 保存偏好
            </Button>
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>登录与安全</CardTitle>
            <CardDescription>
              可退出当前设备，或让所有设备上的登录会话立即失效。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/70 p-3 text-sm">
              <span>此浏览器会话</span>
              <Badge variant="outline">当前</Badge>
            </div>
            <Button onClick={handleSignOut} variant="outline">
              <LogOut className="size-4" /> 退出当前会话
            </Button>
            {revokeConfirm ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={saving}
                  onClick={revokeAllSessions}
                  variant="destructive"
                >
                  <LogOut className="size-4" /> 确认撤销全部会话
                </Button>
                <Button
                  disabled={saving}
                  onClick={cancelRevokeConfirmation}
                  variant="outline"
                >
                  取消
                </Button>
              </div>
            ) : (
              <Button
                disabled={saving}
                onClick={requestRevokeConfirmation}
                variant="destructive"
              >
                <LogOut className="size-4" /> 撤销全部会话
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>数据与隐私</CardTitle>
            <CardDescription>
              下载当前账户的资料、偏好、对话和文档 JSON。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href="/api/account/export">
                <Download className="size-4" /> 下载账户数据
              </a>
            </Button>
          </CardContent>
        </Card>
      </section>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">危险操作</CardTitle>
          <CardDescription>
            删除申请不会立即删除账户；后台确认后会先停用登录、处理个人资料，账务和审计事实按保留规则处理。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <h2 className="font-medium">删除账户申请</h2>
          <Textarea
            maxLength={500}
            onChange={handleReasonChange}
            placeholder="可选：说明删除原因"
            value={reason}
          />
          {settings?.deletionRequest?.status === "requested" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline">申请处理中</Badge>
              <Button
                disabled={saving}
                onClick={cancelDeletion}
                variant="outline"
              >
                撤回申请
              </Button>
            </div>
          ) : deletionConfirm ? (
            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-muted-foreground">
                提交后会进入后台处理。你可以在处理前撤回申请，已产生的账务和审计记录不会被删除。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={saving}
                  onClick={requestDeletion}
                  variant="destructive"
                >
                  确认提交删除申请
                </Button>
                <Button
                  disabled={saving}
                  onClick={cancelDeletionConfirmation}
                  variant="outline"
                >
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <Button
              disabled={saving}
              onClick={requestDeletionConfirmation}
              variant="destructive"
            >
              <Trash2 className="size-4" /> 申请删除账户
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

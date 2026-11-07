// biome-ignore-all lint/performance/noJsxPropsBind: Workspace controls use inline value handlers for compact UI.
"use client";

import { Building2, Plus, RefreshCw, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

type PlatformOrganization = {
  balancePoints: string;
  id: number;
  name: string;
  role: "owner" | "admin" | "member";
  slug: string;
  status: string;
};

type Member = {
  email: string | null;
  name: string | null;
  role: string;
  userId: number;
};

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>(
    []
  );
  const [selected, setSelected] = useState<PlatformOrganization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/organizations", {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      organizations?: PlatformOrganization[];
      selectedOrganizationId?: string | null;
      code?: string;
    };
    if (!response.ok) {
      throw new Error(payload.code || "组织读取失败");
    }
    setOrganizations(payload.organizations ?? []);
    setSelected((current) => {
      const selectedId = payload.selectedOrganizationId
        ? Number(payload.selectedOrganizationId)
        : current?.id;
      return (
        payload.organizations?.find((item) => item.id === selectedId) ??
        payload.organizations?.[0] ??
        null
      );
    });
  }, []);

  useEffect(() => {
    load().catch((error) =>
      setMessage(error instanceof Error ? error.message : "组织读取失败")
    );
  }, [load]);
  useEffect(() => {
    if (!selected) {
      return;
    }
    fetch(`/api/organizations/${selected.id}/members`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          members?: Member[];
          code?: string;
        };
        if (!response.ok) {
          throw new Error(payload.code || "成员读取失败");
        }
        setMembers(payload.members ?? []);
      })
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "成员读取失败")
      );
  }, [selected]);

  const create = async () => {
    if (!name.trim()) {
      return;
    }
    setMessage("");
    const response = await fetch("/api/organizations", {
      body: JSON.stringify({ name }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as { code?: string };
    if (!response.ok) {
      setMessage(payload.code || "组织创建失败");
      return;
    }
    setName("");
    await load();
  };
  const select = async (organization: PlatformOrganization) => {
    setSelected(organization);
    await fetch("/api/organizations/select", {
      body: JSON.stringify({ organizationId: organization.id }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  };
  const addMember = async () => {
    if (!selected || !memberId) {
      return;
    }
    const response = await fetch(`/api/organizations/${selected.id}/members`, {
      body: JSON.stringify({ userId: Number(memberId) }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as { code?: string };
    if (!response.ok) {
      setMessage(payload.code || "成员添加失败");
      return;
    }
    setMemberId("");
    const refreshed = await fetch(`/api/organizations/${selected.id}/members`, {
      cache: "no-store",
    });
    setMembers(
      ((await refreshed.json()) as { members?: Member[] }).members ?? []
    );
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6 lg:p-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <Badge variant="outline">工作区</Badge>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            组织与成员
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            创建多租户工作区，切换后模型与工具调用会使用组织钱包。
          </p>
        </div>
        <Button
          onClick={() =>
            load().catch((error) =>
              setMessage(
                error instanceof Error ? error.message : "组织读取失败"
              )
            )
          }
          variant="outline"
        >
          <RefreshCw className="size-4" />
          刷新
        </Button>
      </header>
      {message ? (
        <p
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
          role="alert"
        >
          {message}
        </p>
      ) : null}
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4" />
              我的组织
            </CardTitle>
            <CardDescription>组织余额与当前成员角色</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {organizations.map((organization) => (
              <button
                className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted ${selected?.id === organization.id ? "border-primary bg-primary/5" : "border-border"}`}
                key={organization.id}
                onClick={() => select(organization)}
                type="button"
              >
                <span>
                  <span className="block font-medium">{organization.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {organization.role} · {organization.balancePoints} 积分
                  </span>
                </span>
                <Badge variant="outline">{organization.slug}</Badge>
              </button>
            ))}
            {organizations.length ? null : (
              <p className="text-sm text-muted-foreground">还没有组织。</p>
            )}
            <div className="flex gap-2 border-t pt-4">
              <Input
                aria-label="组织名称"
                onChange={(event) => setName(event.target.value)}
                placeholder="新组织名称"
                value={name}
              />
              <Button disabled={!name.trim()} onClick={create}>
                <Plus className="size-4" />
                创建
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" />
              成员管理
            </CardTitle>
            <CardDescription>
              {selected ? `${selected.name} 的成员` : "先选择一个组织"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selected ? (
              <>
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      className="flex items-center justify-between rounded-lg border p-3"
                      key={member.userId}
                    >
                      <span>
                        <span className="block font-medium">
                          {member.name ||
                            member.email ||
                            `用户 ${member.userId}`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ID {member.userId}
                        </span>
                      </span>
                      <Badge variant="outline">{member.role}</Badge>
                    </div>
                  ))}
                  {members.length ? null : (
                    <p className="text-sm text-muted-foreground">暂无成员。</p>
                  )}
                </div>
                <div className="mt-4 flex gap-2 border-t pt-4">
                  <Input
                    aria-label="用户 ID"
                    inputMode="numeric"
                    onChange={(event) => setMemberId(event.target.value)}
                    placeholder="输入 Payload 用户 ID"
                    value={memberId}
                  />
                  <Button disabled={!memberId} onClick={addMember}>
                    添加
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                选择组织后查看成员。
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

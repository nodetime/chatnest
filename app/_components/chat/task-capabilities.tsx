// biome-ignore-all lint/performance/noJsxPropsBind: Checkbox rows capture stable, server-projected capability IDs.
"use client";
import { SlidersHorizontal } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import useSWR from "swr";
import { useActiveChat } from "@/app/_hooks/use-active-chat";
import { useAgentInfo } from "@/app/_hooks/use-agent-info";
import { readPersonal } from "@/app/_hooks/use-personal-capabilities";
import { useWorkbenchNavigation } from "@/app/_hooks/use-workbench-navigation";
import type { CapabilitySelection } from "@/server/domain/capability/schema";
import { hasPendingInteraction } from "@/server/domain/message/agent-interactions";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

type Choice = { id: string; name: string; note: string; available: boolean };
function TaskScopeEditor({
  servers,
  skills,
  initial,
  locked,
  pendingInteraction,
  onDone,
  onManage,
}: {
  servers: Choice[];
  skills: Choice[];
  initial: CapabilitySelection;
  locked: boolean;
  pendingInteraction: boolean;
  onDone: (scope: CapabilitySelection) => void;
  onManage: (tab: "connections" | "skills") => void;
}) {
  const [draft, setDraft] = useState(initial);
  const invalid =
    draft.serverIds.some(
      (id) => !servers.some((s) => s.id === id && s.available)
    ) ||
    draft.skillIds.some(
      (id) => !skills.some((s) => s.id === id && s.available)
    );
  function toggle(
    kind: "serverIds" | "skillIds",
    id: string,
    checked: boolean
  ) {
    setDraft((old) => ({
      ...old,
      [kind]: checked
        ? [...new Set([...old[kind], id])]
        : old[kind].filter((value) => value !== id),
    }));
  }
  return (
    <>
      <div className="max-h-[55dvh] space-y-5 overflow-y-auto overscroll-contain py-2">
        {[
          { items: servers, kind: "serverIds" as const, label: "连接" },
          { items: skills, kind: "skillIds" as const, label: "技能" },
        ].map((group) => (
          <fieldset disabled={locked} key={group.kind}>
            <legend className="mb-2 text-xs font-medium text-muted-foreground">
              {group.label}
            </legend>
            {group.items.length ? (
              group.items.map((item) => (
                <label
                  className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60 has-disabled:cursor-default has-disabled:opacity-50"
                  key={item.id}
                >
                  <input
                    checked={draft[group.kind].includes(item.id)}
                    className="mt-0.5 size-3.5 accent-foreground"
                    disabled={!item.available}
                    onChange={(e) =>
                      toggle(group.kind, item.id, e.target.checked)
                    }
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">
                      {item.name}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {item.note}
                    </span>
                  </span>
                </label>
              ))
            ) : (
              <p className="px-2 text-xs text-muted-foreground">
                暂无可用{group.label}
              </p>
            )}
          </fieldset>
        ))}
        {!!invalid && (
          <div
            className="rounded-lg border p-3 text-xs text-muted-foreground"
            role="alert"
          >
            原选择包含已停用或删除的能力。
            <Button
              disabled={locked}
              onClick={() =>
                setDraft({
                  serverIds: draft.serverIds.filter((id) =>
                    servers.some((s) => s.id === id && s.available)
                  ),
                  skillIds: draft.skillIds.filter((id) =>
                    skills.some((s) => s.id === id && s.available)
                  ),
                })
              }
              size="xs"
              variant="ghost"
            >
              移除失效项
            </Button>
          </div>
        )}
        <p className="text-xs leading-5 text-muted-foreground">
          Agent
          自主决定是否使用所选连接和技能。内置工具保留，外部调用仍按权限确认。
        </p>
        {!!pendingInteraction && !locked && (
          <p className="text-xs leading-5 text-muted-foreground" role="status">
            更改用于下一条新消息；当前回答或审批继续使用原来的能力范围。
          </p>
        )}
        {!!locked && (
          <p className="text-xs text-muted-foreground" role="status">
            当前任务正在执行，本轮能力范围已锁定。
          </p>
        )}
      </div>
      <DialogFooter className="flex-row flex-wrap items-center justify-between gap-2 border-t pt-4 sm:justify-between">
        <div className="flex gap-1">
          <Button
            onClick={() => onManage("connections")}
            size="sm"
            variant="ghost"
          >
            管理连接
          </Button>
          <Button onClick={() => onManage("skills")} size="sm" variant="ghost">
            管理技能
          </Button>
        </div>
        <Button
          disabled={locked || invalid}
          onClick={() => onDone(draft)}
          size="sm"
        >
          完成
        </Button>
      </DialogFooter>
    </>
  );
}
export function TaskCapabilities() {
  const [open, setOpen] = useState(false);
  const {
    chatId,
    capabilitySelection,
    setCapabilitySelection,
    status,
    messages,
    isReadonly,
  } = useActiveChat();
  const { data: session } = useSession();
  const regular = session?.user.type === "regular";
  const { data: info, error, isLoading, mutate } = useAgentInfo(open);
  const scope = useSWR<{
    revision: number;
    selection: CapabilitySelection | null;
  }>(
    open && regular
      ? [`/api/personal/scope?chatId=${chatId}`, session?.user.id]
      : null,
    ([url]: [string, string]) =>
      readPersonal<{ revision: number; selection: CapabilitySelection | null }>(
        url
      ),
    { shouldRetryOnError: false }
  );
  const { navigate } = useWorkbenchNavigation();
  const servers: Choice[] =
    info?.servers.map((s) => ({
      available: s.status === "configured",
      id: s.id,
      name: s.name,
      note:
        s.status === "configured"
          ? s.source === "personal"
            ? "个人连接"
            : "平台提供"
          : "暂未就绪",
    })) ?? [];
  const skills: Choice[] =
    info?.skills.map((s) => ({
      available: s.enabled !== false,
      id: s.id ?? `builtin:${s.name}`,
      name: s.displayName ?? s.name,
      note: s.source === "personal" ? "个人技能" : "内置技能",
    })) ?? [];
  const initial = capabilitySelection ??
    scope.data?.selection ?? {
      serverIds: servers.filter((s) => s.available).map((s) => s.id),
      skillIds: skills.filter((s) => s.available).map((s) => s.id),
    };
  const locked = isReadonly || status === "submitted" || status === "streaming";
  const pendingInteraction = hasPendingInteraction(messages);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button
          aria-label="本次使用"
          className="h-8 rounded-lg px-2 text-xs text-muted-foreground"
          size="sm"
          variant="ghost"
        >
          <SlidersHorizontal className="size-3.5" />
          <span className="hidden sm:inline">本次使用</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        className="gap-4 rounded-2xl sm:max-w-[560px]"
        data-testid="task-capabilities"
      >
        <DialogHeader>
          <DialogTitle>本次使用</DialogTitle>
          <DialogDescription>选择本次任务可用的连接和技能。</DialogDescription>
        </DialogHeader>
        {!!(isLoading || (regular && scope.isLoading)) && (
          <p className="py-5 text-sm text-muted-foreground" role="status">
            正在读取可用能力…
          </p>
        )}
        {!!(error || scope.error) && (
          <p className="text-sm text-destructive" role="alert">
            暂时未能读取当前能力范围。
            <Button
              onClick={() => {
                mutate();
                scope.mutate();
              }}
              size="sm"
              variant="ghost"
            >
              重新读取
            </Button>
          </p>
        )}
        {!!info && !error && !scope.error && (!regular || !!scope.data) && (
          <TaskScopeEditor
            initial={initial}
            key={chatId}
            locked={locked}
            onDone={(value) => {
              setCapabilitySelection(value);
              setOpen(false);
            }}
            onManage={(tab) => {
              setOpen(false);
              navigate(tab);
            }}
            pendingInteraction={pendingInteraction}
            servers={servers}
            skills={skills}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

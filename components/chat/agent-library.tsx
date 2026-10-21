"use client";
import {
  BookOpen,
  Check,
  Monitor,
  Moon,
  Plug,
  Settings2,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAgentInfo } from "@/hooks/use-agent-info";
import { AgentGeneralStatus } from "./agent-general-status";
import { McpConnections } from "./mcp-connections";

type Tab = "skills" | "tools" | "settings";

export function AgentLibrary({
  tab = "skills",
  compact = false,
  label: triggerLabel,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  tab?: Tab;
  compact?: boolean;
  label?: string;
  open?: boolean;
  onOpenChange?: (value: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [activeTab, setActiveTab] = useState<Tab>(tab);
  const { data, error, isLoading, mutate } = useAgentInfo(open);
  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);
  const { theme, setTheme } = useTheme();
  const tabs = [
    { icon: Settings2, id: "settings" as const, label: "常规" },
    { icon: Plug, id: "tools" as const, label: "工具连接" },
    { icon: BookOpen, id: "skills" as const, label: "技能" },
  ];
  const current = tabs.find((item) => item.id === tab) ?? tabs[0];
  const Icon = current.icon;
  const handleOpenChange = useCallback(
    (value: boolean) => {
      setInternalOpen(value);
      onOpenChange?.(value);
      if (value) {
        setActiveTab(tab);
      }
    },
    [tab, onOpenChange]
  );
  const handleTab = useCallback(
    (event: MouseEvent<HTMLButtonElement>) =>
      setActiveTab(event.currentTarget.dataset.tab as Tab),
    []
  );
  const handleTheme = useCallback(
    (event: MouseEvent<HTMLButtonElement>) =>
      setTheme(event.currentTarget.dataset.theme ?? "system"),
    [setTheme]
  );
  const handleTabKey = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const tabIds: Tab[] = ["settings", "tools", "skills"];
      const index = tabIds.indexOf(event.currentTarget.dataset.tab as Tab);
      const delta =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!delta) {
        return;
      }
      event.preventDefault();
      const next = tabIds[(index + delta + tabIds.length) % tabIds.length];
      setActiveTab(next);
      document.getElementById(`agent-tab-${next}`)?.focus();
    },
    []
  );
  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button
            aria-label={triggerLabel ?? current.label}
            className={
              compact
                ? "h-8 rounded-full px-2.5 text-xs text-muted-foreground"
                : "h-10 w-full justify-start gap-3 rounded-lg px-2.5 text-sm font-normal text-sidebar-foreground"
            }
            variant="ghost"
          >
            <Icon className="size-[18px]" />
            <span>{triggerLabel ?? current.label}</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85dvh] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-[680px]">
        <DialogHeader className="px-6 pt-6 pb-5">
          <DialogTitle className="text-xl">设置</DialogTitle>
          <DialogDescription>
            调整外观，查看可用的工具和技能。
          </DialogDescription>
        </DialogHeader>
        <div
          aria-label="能力分类"
          className="flex gap-1 border-b px-5"
          role="tablist"
        >
          {tabs.map(({ id, label, icon: TabIcon }) => (
            <button
              aria-controls={`agent-panel-${id}`}
              aria-selected={activeTab === id}
              className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm ${activeTab === id ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              data-tab={id}
              id={`agent-tab-${id}`}
              key={id}
              onClick={handleTab}
              onKeyDown={handleTabKey}
              role="tab"
              tabIndex={activeTab === id ? 0 : -1}
              type="button"
            >
              <TabIcon className="size-4" />
              {label}
            </button>
          ))}
        </div>
        <div
          aria-labelledby={`agent-tab-${activeTab}`}
          className="min-h-[300px] px-6 py-6"
          id={`agent-panel-${activeTab}`}
          role="tabpanel"
        >
          {!!isLoading && (
            <p className="text-sm text-muted-foreground">正在加载…</p>
          )}
          {!!error && (
            <p className="text-sm text-destructive" role="alert">
              暂时未能加载，请稍后重试。
              <button
                className="ml-2 underline underline-offset-4"
                onClick={handleRefresh}
                type="button"
              >
                重新读取
              </button>
            </p>
          )}
          {data && activeTab === "skills" && (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">
                按任务需要使用相关技能。
              </p>
              {data.skills.map((skill) => (
                <div className="rounded-xl border p-4" key={skill.name}>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <BookOpen className="size-4 shrink-0" />
                    <span className="break-all">
                      {skill.displayName ?? skill.name}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground">
                      <Check className="size-3" />
                      可用
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {skill.shortDescription ?? skill.description}
                  </p>
                  {!!skill.displayName && (
                    <details className="mt-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">详细信息</summary>
                      <p className="mt-2 break-all font-mono">{skill.name}</p>
                    </details>
                  )}
                </div>
              ))}
              {!data.skills.length && <p className="text-sm">暂无可用技能。</p>}
            </div>
          )}
          {data && activeTab === "tools" && (
            <McpConnections info={data} onChanged={handleRefresh} />
          )}
          {data && activeTab === "settings" && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-3 text-sm font-medium">外观</h3>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: Sun, id: "light", label: "浅色" },
                    { icon: Moon, id: "dark", label: "深色" },
                    { icon: Monitor, id: "system", label: "跟随系统" },
                  ].map(({ id, label, icon: ThemeIcon }) => (
                    <button
                      aria-pressed={theme === id}
                      className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm ${theme === id ? "border-foreground bg-secondary" : "text-muted-foreground hover:bg-secondary/50"}`}
                      data-theme={id}
                      key={id}
                      onClick={handleTheme}
                      type="button"
                    >
                      <ThemeIcon className="size-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <AgentGeneralStatus
                connectionCount={data.servers.length}
                modelConfigured={data.modelConfigured}
                uploadsConfigured={data.uploadsConfigured}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

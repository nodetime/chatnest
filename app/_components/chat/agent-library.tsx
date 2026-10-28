"use client";
import { BookOpen, Plug, Settings2 } from "lucide-react";
import { useTheme } from "next-themes";
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useState,
} from "react";
import { Button } from "@/app/_components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/_components/ui/dialog";
import { useIsMobile } from "@/app/_hooks/use-mobile";
import {
  AgentLibraryPanel,
  type AgentLibraryTab as Tab,
} from "./agent-library-panel";
import { PersonalConnections } from "./personal-connections";
import { PersonalSkills } from "./personal-skills";

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
  const { theme, setTheme } = useTheme();
  const isMobile = useIsMobile();
  const tabs = [
    { icon: Settings2, id: "settings" as const, label: "常规" },
    { icon: Plug, id: "tools" as const, label: "连接" },
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
      const delta = ["ArrowRight", "ArrowDown"].includes(event.key)
        ? 1
        : ["ArrowLeft", "ArrowUp"].includes(event.key)
          ? -1
          : 0;
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
                ? "h-8 rounded-lg px-2 text-xs text-muted-foreground"
                : "h-10 w-full justify-start gap-3 rounded-lg px-2.5 text-sm font-normal text-sidebar-foreground"
            }
            variant="ghost"
          >
            <Icon className="size-[18px]" />
            <span className={compact && !triggerLabel ? "sr-only" : undefined}>
              {triggerLabel ?? current.label}
            </span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="flex h-[min(640px,85dvh)] max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[760px]">
        <DialogHeader className="shrink-0 border-b border-border/70 px-6 py-5">
          <DialogTitle className="text-lg">设置</DialogTitle>
          <DialogDescription>管理外观、个人连接与技能。</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[152px_minmax(0,1fr)]">
          <div
            aria-label="能力分类"
            aria-orientation={isMobile ? "horizontal" : "vertical"}
            className="flex shrink-0 gap-1 border-b border-border/70 bg-secondary/30 p-2 md:flex-col md:justify-start md:border-r md:border-b-0 md:p-3"
            data-testid="settings-navigation"
            role="tablist"
          >
            {tabs.map(({ id, label, icon: TabIcon }) => (
              <button
                aria-controls={`agent-panel-${id}`}
                aria-selected={activeTab === id}
                className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm md:flex-none md:justify-start ${activeTab === id ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"}`}
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
            className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
            data-testid="settings-content"
            id={`agent-panel-${activeTab}`}
            role="tabpanel"
          >
            {activeTab === "tools" ? (
              <PersonalConnections />
            ) : activeTab === "skills" ? (
              <PersonalSkills />
            ) : (
              <AgentLibraryPanel
                onThemeChange={handleTheme}
                tab="settings"
                theme={theme}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

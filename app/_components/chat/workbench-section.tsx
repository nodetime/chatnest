// biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes per-entry workspace handlers.
"use client";
import { ArrowLeft, Link2, Sparkles } from "lucide-react";
import { useTheme } from "next-themes";
import { useAgentInfo } from "@/app/_hooks/use-agent-info";
import { useWorkbenchNavigation } from "@/app/_hooks/use-workbench-navigation";
import { Button } from "../ui/button";
import { AgentLibraryPanel } from "./agent-library-panel";
import { SavedArtifactCards } from "./workspace-home";

export function WorkbenchSection() {
  const { section, navigate } = useWorkbenchNavigation();
  const { data, error, isLoading, mutate } = useAgentInfo(section !== "chat");
  const { theme } = useTheme();
  const title = {
    chat: "对话",
    connections: "连接",
    files: "文件",
    skills: "技能",
  }[section];
  return (
    <div
      className="flex h-dvh min-w-0 flex-1 flex-col bg-background"
      data-testid="workbench-section"
    >
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border/70 px-5 sm:px-8">
        <Button
          aria-label="返回对话"
          onClick={() => navigate("chat")}
          size="icon"
          variant="ghost"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-medium">{title}</h1>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-7 sm:px-8">
        <div className="mx-auto w-full max-w-5xl">
          {section === "files" ? (
            <SavedArtifactCards />
          ) : (
            <>
              <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
                {section === "connections" ? (
                  <Link2 className="size-4" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {section === "connections"
                  ? "可供 Agent 使用的工具连接"
                  : "按任务需要使用的方法与能力"}
              </div>
              {!!isLoading && <p role="status">正在加载…</p>}
              {!!error && (
                <Button onClick={() => mutate()} variant="outline">
                  重新加载
                </Button>
              )}
              <AgentLibraryPanel
                info={data}
                tab={section === "connections" ? "tools" : "skills"}
                theme={theme}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

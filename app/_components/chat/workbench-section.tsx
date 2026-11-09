// biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes per-entry workspace handlers.
"use client";
import { ArrowLeft } from "lucide-react";
import { useWorkbenchNavigation } from "@/app/_hooks/use-workbench-navigation";
import { Button } from "../ui/button";
import { PersonalConnections } from "./personal-connections";
import { PersonalSkills } from "./personal-skills";
import { SavedArtifactCards } from "./workspace-home";

export function WorkbenchSection() {
  const { section, navigate } = useWorkbenchNavigation();
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
      <header className="workbench-header flex h-[52px] shrink-0 items-center gap-3 border-b border-border/70 px-5 sm:px-8">
        <Button
          aria-label="返回对话"
          onClick={() => navigate("chat")}
          size="icon"
          variant="ghost"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-base font-semibold">{title}</h1>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 sm:py-10">
        <div className="mx-auto w-full max-w-4xl">
          {section === "files" ? (
            <section className="space-y-6">
              <div>
                <h2 className="[font-family:var(--workbench-display-font)] text-2xl font-medium leading-snug sm:text-[28px]">
                  已保存的成果
                </h2>
                <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                  在这里继续查看对话中生成的表格、文档与代码。
                </p>
              </div>
              <SavedArtifactCards />
            </section>
          ) : section === "connections" ? (
            <PersonalConnections />
          ) : (
            <PersonalSkills />
          )}
        </div>
      </main>
    </div>
  );
}

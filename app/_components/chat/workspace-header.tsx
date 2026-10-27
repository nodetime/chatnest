// biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes workspace menu callbacks.
"use client";

import {
  ChevronDown,
  FileText,
  Globe,
  Maximize2,
  Minimize2,
  Monitor,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  ArtifactActions,
  ArtifactClose,
  ArtifactHeader,
  ArtifactTitle,
} from "@/app/_components/ai-elements/artifact";
import { Button } from "@/app/_components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/_components/ui/dropdown-menu";
import { useWorkspace, type WorkspaceTab } from "@/app/_hooks/use-workspace";
import { cn } from "@/app/_lib/utils";

const modes = [
  { icon: FileText, id: "document", title: "产物" },
  { icon: Monitor, id: "browser", title: "浏览器" },
  { icon: Globe, id: "sources", title: "来源" },
] as const;

/** One header shared by file, browser and source modes; bodies stay mounted. */
export function WorkspaceHeader({
  children,
  actions,
  controls,
}: {
  children?: ReactNode;
  actions?: ReactNode;
  controls?: ReactNode;
}) {
  const workspace = useWorkspace();
  const mode = modes.find((item) => item.id === workspace.tab) ?? modes[0];
  const Icon = mode.icon;
  return (
    <ArtifactHeader
      className={cn(
        "@container h-[64px] shrink-0 gap-1 border-border/60 bg-background px-4 py-2",
        controls &&
          "@max-[500px]:h-auto @max-[500px]:flex-wrap @max-[500px]:gap-y-0"
      )}
      data-testid="workspace-header"
    >
      <div className="min-w-0 flex-1 @max-[500px]:min-h-12">
        {children ?? (
          <ArtifactTitle>
            {mode.title === "产物" ? "本次对话的产物" : mode.title}
          </ArtifactTitle>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="切换工作区视图"
            className="h-8 shrink-0 gap-1 rounded-md px-1.5 text-muted-foreground"
            title="切换工作区视图"
            variant="ghost"
          >
            <Icon className="size-4" />
            {!(workspace.tab === "document" && children) && (
              <span className="sr-only sm:not-sr-only text-xs">
                {mode.title}
              </span>
            )}
            <ChevronDown className="hidden size-3 @min-[600px]:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>工作区视图</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            onValueChange={(tab) =>
              workspace.update({ tab: tab as WorkspaceTab })
            }
            value={workspace.tab}
          >
            {modes.map((item) => (
              <DropdownMenuRadioItem key={item.id} value={item.id}>
                {item.title}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {controls}
      <ArtifactActions className="shrink-0 gap-0.5">
        {actions}
        <Button
          aria-label={workspace.expanded ? "收起工作区" : "展开工作区"}
          className="hidden size-8 rounded-md md:inline-flex"
          onClick={() => workspace.update({ expanded: !workspace.expanded })}
          size="icon"
          variant="ghost"
        >
          {workspace.expanded ? (
            <Minimize2 className="size-4" />
          ) : (
            <Maximize2 className="size-4" />
          )}
        </Button>
        <ArtifactClose
          aria-label="关闭工作区"
          className="size-8 rounded-md"
          onClick={workspace.close}
        />
      </ArtifactActions>
    </ArtifactHeader>
  );
}

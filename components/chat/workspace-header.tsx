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
} from "@/components/ai-elements/artifact";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace, type WorkspaceTab } from "@/hooks/use-workspace";

const modes = [
  { icon: FileText, id: "document", title: "产物" },
  { icon: Monitor, id: "browser", title: "浏览器" },
  { icon: Globe, id: "sources", title: "来源" },
] as const;

/** One header shared by file, browser and source modes; bodies stay mounted. */
export function WorkspaceHeader({
  children,
  actions,
}: {
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const workspace = useWorkspace();
  const mode = modes.find((item) => item.id === workspace.tab) ?? modes[0];
  const Icon = mode.icon;
  return (
    <ArtifactHeader
      className="h-16 shrink-0 gap-2 bg-background px-3 py-2"
      data-testid="workspace-header"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="切换工作区视图"
              className="h-9 shrink-0 gap-1.5 px-2 text-muted-foreground"
              variant="ghost"
            >
              <Icon className="size-4" />
              <span className="sr-only sm:not-sr-only text-xs">
                {mode.title}
              </span>
              <ChevronDown className="size-3" />
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
        <div className="min-w-0 flex-1">
          {children ?? (
            <ArtifactTitle className="px-2">
              {mode.title === "产物" ? "本次对话的产物" : mode.title}
            </ArtifactTitle>
          )}
        </div>
      </div>
      <ArtifactActions className="shrink-0 gap-0.5">
        {actions}
        <Button
          aria-label={workspace.expanded ? "收起工作区" : "展开工作区"}
          className="hidden size-9 rounded-md md:inline-flex"
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
          className="size-9 rounded-md"
          onClick={workspace.close}
        />
      </ArtifactActions>
    </ArtifactHeader>
  );
}

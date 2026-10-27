// biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes the workspace toggle.
"use client";
import { PanelLeft, PanelRight, PenSquare } from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import { useSidebar } from "@/app/_components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/_components/ui/tooltip";
import { useActiveChat } from "@/app/_hooks/use-active-chat";
import { useWorkspace } from "@/app/_hooks/use-workspace";
import { ChatMenu } from "./chat-menu";
import { TaskProgress } from "./task-progress";
import type { VisibilityType } from "./visibility-selector";

export function ChatHeader({
  chatId,
  selectedVisibilityType: _selectedVisibilityType,
  isReadonly: _isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const { toggleSidebar, isMobile } = useSidebar();
  const workspace = useWorkspace();
  const { chatTitle, startNewChat, messages, taskProgress } = useActiveChat();
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border/70 bg-background px-4 sm:px-6">
      {!!isMobile && (
        <Button
          aria-label="打开侧栏"
          onClick={toggleSidebar}
          size="icon"
          variant="ghost"
        >
          <PanelLeft className="size-5" />
        </Button>
      )}
      <div className="min-w-0 flex-1 px-1">
        <p
          className="truncate text-sm font-medium"
          data-testid="chat-title"
          title={chatTitle}
        >
          {chatTitle}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <TaskProgress compact plan={taskProgress} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-expanded={workspace.open}
              aria-label={workspace.open ? "隐藏工作区" : "打开工作区"}
              className="size-9 rounded-md"
              onClick={() =>
                workspace.open ? workspace.close() : workspace.show()
              }
              size="icon"
              variant="ghost"
            >
              <PanelRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {workspace.open ? "隐藏工作区" : "打开工作区"}
          </TooltipContent>
        </Tooltip>
        {messages.length > 0 && <ChatMenu key={chatId} />}
        <Button
          aria-label="新对话"
          className="md:hidden"
          onClick={startNewChat}
          size="icon"
          variant="ghost"
        >
          <PenSquare className="size-4" />
        </Button>
      </div>
    </header>
  );
}

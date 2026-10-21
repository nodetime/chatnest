"use client";
import { ListPlus, MessageSquare, PanelLeft, PenSquare } from "lucide-react";
import type { User } from "next-auth";
import { useCallback, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useActiveChat } from "@/hooks/use-active-chat";
import { AgentLibrary } from "./agent-library";
import { ChatSearch } from "./chat-search";
import { SidebarHistory } from "./sidebar-history";
import { SidebarUserNav } from "./sidebar-user-nav";
import { TaskDialog } from "./task-dialog";

export function AppSidebar({
  user,
  isPlatformAdmin = false,
}: {
  user: User | undefined;
  isPlatformAdmin?: boolean;
}) {
  const { toggleSidebar, setOpenMobile } = useSidebar();
  const { startNewChat } = useActiveChat();
  const [taskOpen, setTaskOpen] = useState(false);
  const handleTask = useCallback(() => setTaskOpen(true), []);
  const handleStarted = useCallback(
    () => setOpenMobile(false),
    [setOpenMobile]
  );
  const handleNew = useCallback(() => {
    setOpenMobile(false);
    startNewChat();
  }, [setOpenMobile, startNewChat]);
  return (
    <>
      <Sidebar className="border-r-0" collapsible="offcanvas">
        <SidebarHeader className="px-3 pt-3 pb-2">
          <div className="mb-3 flex items-center justify-between px-1">
            <button
              aria-label="ChatNest 首页"
              className="flex items-center gap-2 text-sm font-semibold"
              onClick={handleNew}
              type="button"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-background">
                <MessageSquare className="size-4" />
              </span>
              ChatNest
            </button>
            <button
              aria-label="收起侧栏"
              className="rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent"
              onClick={toggleSidebar}
              type="button"
            >
              <PanelLeft className="size-[18px]" />
            </button>
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="h-9 gap-2 rounded-xl px-2.5 text-sm"
                onClick={handleNew}
              >
                <PenSquare className="size-[18px]" />
                <span>新对话</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  ⌘ ⇧ O
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="h-9 gap-2 rounded-xl px-2.5 text-sm"
                onClick={handleTask}
              >
                <ListPlus className="size-[18px]" />
                <span>创建任务</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <ChatSearch />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="gap-2">
          <SidebarHistory user={user} />
        </SidebarContent>
        <SidebarFooter className="gap-2 px-3 pb-3">
          {user ? (
            <SidebarUserNav isPlatformAdmin={isPlatformAdmin} user={user} />
          ) : (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              <AgentLibrary tab="settings" />
              登录后保存对话
            </p>
          )}
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <TaskDialog
        onOpenChange={setTaskOpen}
        onStarted={handleStarted}
        open={taskOpen}
      />
    </>
  );
}

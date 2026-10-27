// biome-ignore-all lint/performance/noJsxPropsBind: React Compiler memoizes per-entry workspace handlers.
"use client";
import {
  Folder,
  Link2,
  MessageSquare,
  PanelLeft,
  Plus,
  Sparkles,
} from "lucide-react";
import type { User } from "next-auth";
import { useCallback } from "react";
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
} from "@/app/_components/ui/sidebar";
import { useActiveChat } from "@/app/_hooks/use-active-chat";
import {
  useWorkbenchNavigation,
  type WorkbenchSection,
} from "@/app/_hooks/use-workbench-navigation";
import { AgentLibrary } from "./agent-library";
import { ChatSearch } from "./chat-search";
import { SidebarHistory } from "./sidebar-history";
import { SidebarUserNav } from "./sidebar-user-nav";

export function AppSidebar({
  user,
  isPlatformAdmin = false,
}: {
  user: User | undefined;
  isPlatformAdmin?: boolean;
}) {
  const { toggleSidebar, setOpenMobile } = useSidebar();
  const { startNewChat } = useActiveChat();
  const { section, navigate } = useWorkbenchNavigation();
  const handleNew = useCallback(() => {
    setOpenMobile(false);
    navigate("chat");
    startNewChat();
  }, [navigate, setOpenMobile, startNewChat]);
  const open = (next: WorkbenchSection) => {
    navigate(next);
    setOpenMobile(false);
  };
  return (
    <Sidebar className="border-r border-sidebar-border/60" collapsible="icon">
      <SidebarHeader className="gap-4 px-3 py-4 group-data-[collapsible=icon]:px-3">
        <div className="flex h-12 items-center justify-between gap-2 px-1 group-data-[collapsible=icon]:justify-center">
          <button
            aria-label="ChatNest 首页"
            className="flex min-w-0 items-center gap-2 text-sm font-semibold group-data-[collapsible=icon]:hidden"
            onClick={handleNew}
            type="button"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
              C
            </span>
            <span>ChatNest</span>
          </button>
          <button
            aria-label="切换侧栏"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            onClick={toggleSidebar}
            type="button"
          >
            <PanelLeft className="size-4" />
          </button>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label="新对话"
              className="h-9 justify-center rounded-lg bg-primary text-primary-foreground! hover:bg-primary/90 hover:text-primary-foreground!"
              onClick={handleNew}
              tooltip="新对话"
            >
              <Plus className="size-[18px]" />
              <span>新对话</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-5 overflow-x-hidden px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label="对话"
              className="h-10 rounded-lg text-[13px]"
              isActive={section === "chat"}
              onClick={() => open("chat")}
              tooltip="对话"
            >
              <MessageSquare />
              <span>对话</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label="文件"
              className="h-10 rounded-lg text-[13px]"
              isActive={section === "files"}
              onClick={() => open("files")}
              tooltip="文件"
            >
              <Folder />
              <span>文件</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label="连接"
              className="h-10 rounded-lg text-[13px]"
              isActive={section === "connections"}
              onClick={() => open("connections")}
              tooltip="连接"
            >
              <Link2 />
              <span>连接</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label="技能"
              className="h-10 rounded-lg text-[13px]"
              isActive={section === "skills"}
              onClick={() => open("skills")}
              tooltip="技能"
            >
              <Sparkles />
              <span>技能</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="group-data-[collapsible=icon]:hidden">
          <ChatSearch />
          <SidebarHistory user={user} />
        </div>
      </SidebarContent>
      <SidebarFooter className="gap-1 px-3 py-4">
        {user ? (
          <SidebarUserNav isPlatformAdmin={isPlatformAdmin} user={user} />
        ) : (
          <AgentLibrary tab="settings" />
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

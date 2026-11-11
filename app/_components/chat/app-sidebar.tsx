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
import { BrandHomeLink } from "@/app/_components/brand-home-link";
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
import { ChatSearch } from "./chat-search";
import { OrganizationSwitcher } from "./organization-switcher";
import { SidebarHistory } from "./sidebar-history";
import { SidebarUserNav } from "./sidebar-user-nav";

export function AppSidebar({
  showOrganizations = false,
  user,
}: {
  showOrganizations?: boolean;
  user: User | undefined;
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
    <Sidebar
      className="border-r border-sidebar-border/60 group-data-[collapsible=icon]:[&_[data-sidebar=menu-button]]:size-10! group-data-[collapsible=icon]:[&_[data-sidebar=menu-button]]:p-0! group-data-[collapsible=icon]:[&_[data-sidebar=menu-button]]:text-sidebar-foreground!"
      collapsible="icon"
    >
      <SidebarHeader className="gap-3 px-3 py-2 group-data-[collapsible=icon]:px-3">
        <div className="relative h-10 min-w-0">
          <BrandHomeLink
            className="workbench-sidebar-brand absolute top-0 left-1 h-10"
            onClick={() => setOpenMobile(false)}
          />
          <button
            aria-label="切换侧栏"
            className="workbench-sidebar-toggle absolute top-0 right-0 flex size-10 items-center justify-center rounded-lg bg-sidebar text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground group-data-[collapsible=icon]:text-sidebar-foreground"
            onClick={toggleSidebar}
            type="button"
          >
            <PanelLeft className="size-4" />
          </button>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label="新建对话"
              className="h-9 justify-center rounded-lg bg-primary text-primary-foreground! hover:bg-primary/90 hover:text-primary-foreground!"
              onClick={handleNew}
              tooltip="新建对话"
            >
              <Plus className="size-[18px]" />
              <span>新建对话</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {showOrganizations ? (
            <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
              <OrganizationSwitcher userType={user?.type} />
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-3 overflow-x-hidden px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label="对话"
              className="h-9 rounded-lg text-[13px]"
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
              aria-label="产物"
              className="h-9 rounded-lg text-[13px]"
              isActive={section === "files"}
              onClick={() => open("files")}
              tooltip="产物"
            >
              <Folder />
              <span>产物</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label="连接"
              className="h-9 rounded-lg text-[13px]"
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
              className="h-9 rounded-lg text-[13px]"
              isActive={section === "skills"}
              onClick={() => open("skills")}
              tooltip="技能"
            >
              <Sparkles />
              <span>技能</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="workbench-sidebar-history">
          <ChatSearch />
          <SidebarHistory user={user} />
        </div>
      </SidebarContent>
      <SidebarFooter className="gap-1 px-3 py-4">
        <SidebarUserNav user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

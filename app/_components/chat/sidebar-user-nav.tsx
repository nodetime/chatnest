"use client";

import { ChevronUp, LogIn, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useCallback, useState } from "react";
import { PlatformAdminLink } from "@/app/_components/admin/platform-admin-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/_components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/app/_components/ui/sidebar";
import { AgentLibrary } from "./agent-library";
import { LoaderIcon } from "./icons";
import { toast } from "./toast";

export function SidebarUserNav({
  user,
  isPlatformAdmin = false,
}: {
  user: User | undefined;
  isPlatformAdmin?: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const router = useRouter();
  const { data, status } = useSession();
  const { setTheme, resolvedTheme } = useTheme();

  const isGuest = data?.user?.type !== "regular";
  const handleThemeSelect = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  const handleAuthClick = useCallback(() => {
    if (status === "loading") {
      toast({
        description: "正在读取登录状态，请稍候。",
        type: "error",
      });

      return;
    }

    if (isGuest) {
      router.push("/login");
    } else {
      signOut({
        redirectTo: "/",
      });
    }
  }, [isGuest, router, status]);

  if (status !== "loading" && isGuest) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            className="h-9 rounded-lg"
            data-testid="sidebar-login"
          >
            <Link href="/login">
              <LogIn className="size-4" />
              <span>登录</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {status === "loading" ? (
                <SidebarMenuButton className="h-10 justify-between rounded-lg bg-transparent text-sidebar-foreground/50 transition-colors duration-150 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                  <div className="flex flex-row items-center gap-2">
                    <div className="size-6 animate-pulse rounded-full bg-sidebar-foreground/10" />
                    <span className="animate-pulse rounded-md bg-sidebar-foreground/10 text-transparent text-[13px]">
                      读取账户…
                    </span>
                  </div>
                  <div className="animate-spin text-sidebar-foreground/50">
                    <LoaderIcon />
                  </div>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  aria-label="个人账户"
                  className="h-10 px-2 rounded-lg group-data-[collapsible=icon]:p-0.5! bg-transparent text-sidebar-foreground/70 transition-colors duration-150 hover:text-sidebar-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  data-testid="user-nav-button"
                  tooltip="个人账户"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--workbench-selection)] text-xs font-medium text-foreground">
                    {(user?.email?.[0] ?? "C").toUpperCase()}
                  </span>
                  <span
                    className="truncate text-[13px]"
                    data-testid="user-email"
                  >
                    {user?.email}
                  </span>
                  <ChevronUp className="ml-auto size-3.5 text-sidebar-foreground/50" />
                </SidebarMenuButton>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-56 rounded-xl border border-border/60 bg-popover shadow-[var(--shadow-float)]"
              data-testid="user-nav-menu"
              side="top"
            >
              <DropdownMenuItem onSelect={openSettings}>
                <Settings2 className="size-4" />
                设置
              </DropdownMenuItem>
              {!!isPlatformAdmin && (
                <DropdownMenuItem asChild>
                  <PlatformAdminLink isPlatformAdmin={isPlatformAdmin} />
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="cursor-pointer text-[13px]"
                data-testid="user-nav-item-theme"
                onSelect={handleThemeSelect}
              >
                {resolvedTheme === "light" ? "切换深色模式" : "切换浅色模式"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild data-testid="user-nav-item-auth">
                <button
                  className="w-full cursor-pointer text-[13px]"
                  onClick={handleAuthClick}
                  type="button"
                >
                  {isGuest ? "登录账号" : "退出登录"}
                </button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <AgentLibrary
        hideTrigger
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
        tab="settings"
      />
    </>
  );
}

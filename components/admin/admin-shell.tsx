"use client";
// Adapted upstream dashboard Layout, AppSidebar and NavUser; see THIRD_PARTY_NOTICES.md.
import { ArrowLeft, ChevronsUpDown, Command, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { type CSSProperties, type ReactNode, useCallback } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminNavigation, adminLocation } from "./admin-navigation";

export type AdminIdentity = { name: string; email: string };
function AdminAccount({ identity }: { identity: AdminIdentity }) {
  const { isMobile } = useSidebar();
  const logout = useCallback(() => {
    signOut({ redirectTo: "/" });
  }, []);
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              aria-label={`${identity.name}的账号菜单`}
              className="data-[state=open]:bg-sidebar-accent"
              size="lg"
            >
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-xs font-semibold"
              >
                {identity.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{identity.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {identity.email || "平台管理员"}
                </span>
              </span>
              <ChevronsUpDown aria-hidden="true" className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56"
            side={isMobile ? "top" : "right"}
            sideOffset={8}
          >
            <DropdownMenuLabel>
              <span className="block">{identity.name}</span>
              <span className="block break-all text-xs font-normal text-muted-foreground">
                {identity.email}
              </span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                平台管理员
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/">
                <ArrowLeft aria-hidden="true" />
                返回工作台
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout}>
              <LogOut aria-hidden="true" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
function AdminSidebar({ identity }: { identity: AdminIdentity }) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const contents = (
    <>
      <SidebarHeader className="h-14 justify-center border-b px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="ChatNest 平台管理">
              <Link href="/admin">
                <Command aria-hidden="true" />
                <span className="font-semibold">
                  ChatNest{" "}
                  <span className="font-normal text-muted-foreground">
                    / Admin
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <AdminNavigation />
        <p className="px-4 text-xs leading-5 text-muted-foreground group-data-[collapsible=icon]:hidden">
          平台级配置，对所有用户生效。
        </p>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <AdminAccount identity={identity} />
      </SidebarFooter>
    </>
  );
  if (isMobile) {
    return (
      <Sheet onOpenChange={setOpenMobile} open={openMobile}>
        <SheetContent className="w-72 bg-sidebar p-0" side="left">
          <SheetHeader className="sr-only">
            <SheetTitle>平台管理导航</SheetTitle>
            <SheetDescription>切换管理页面或返回工作台。</SheetDescription>
          </SheetHeader>
          {contents}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Sidebar className="border-r" collapsible="icon">
      {contents}
    </Sidebar>
  );
}
export function AdminShell({
  children,
  identity,
}: {
  children: ReactNode;
  identity: AdminIdentity;
}) {
  const location = adminLocation(usePathname() ?? "/admin");
  return (
    <TooltipProvider>
      <SidebarProvider
        className="bg-background text-foreground"
        style={{ "--sidebar-width": "16rem" } as CSSProperties}
      >
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3"
          href="#admin-content"
        >
          跳到管理内容
        </a>
        <AdminSidebar identity={identity} />
        <SidebarInset className="min-w-0 bg-background">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger aria-label="切换管理导航" />
              <Separator className="h-4" orientation="vertical" />
              <Breadcrumb aria-label="当前位置">
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden sm:inline-flex">
                    <BreadcrumbLink asChild>
                      <Link href="/admin">平台管理</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden sm:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>
                      {location?.label ?? "平台管理"}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <Link
              className="inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 sm:text-sm"
              href="/"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              返回工作台
            </Link>
          </header>
          <div
            className="min-w-0 flex-1 space-y-6 p-4 md:p-6 lg:p-8"
            id="admin-content"
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

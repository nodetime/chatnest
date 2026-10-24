"use client";
// Adapted upstream NavMain/NavLinkItem composition; see THIRD_PARTY_NOTICES.md.
import { HardDrive, LayoutDashboard, Plug } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback } from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/app/_components/ui/sidebar";

export const adminLinks = [
  { href: "/admin", icon: LayoutDashboard, label: "概览" },
  { href: "/admin/connections", icon: Plug, label: "工具连接" },
  { href: "/admin/storage", icon: HardDrive, label: "文件存储" },
];
export function adminLocation(pathname: string) {
  const current = pathname.replace(/^\/demo(?=\/)/, "").replace(/\/$/, "");
  return adminLinks.find(({ href }) => current === href);
}
export function AdminNavigationItems({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const current = adminLocation(pathname);
  return (
    <nav aria-label="平台管理">
      <SidebarGroup>
        <SidebarGroupLabel>平台管理</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {adminLinks.map(({ href, label, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  asChild
                  isActive={current?.href === href}
                  tooltip={label}
                >
                  <Link
                    aria-current={current?.href === href ? "page" : undefined}
                    href={href}
                    onClick={onNavigate}
                  >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </nav>
  );
}
export function AdminNavigation() {
  const { setOpenMobile } = useSidebar();
  const closeMobile = useCallback(() => setOpenMobile(false), [setOpenMobile]);
  return (
    <AdminNavigationItems
      onNavigate={closeMobile}
      pathname={usePathname() ?? "/admin"}
    />
  );
}

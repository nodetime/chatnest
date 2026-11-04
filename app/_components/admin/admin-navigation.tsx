"use client";
// Adapted upstream NavMain/NavLinkItem composition; see THIRD_PARTY_NOTICES.md.
import {
  Banknote,
  BellRing,
  BrainCircuit,
  HardDrive,
  LayoutDashboard,
  Plug,
  UserRound,
} from "lucide-react";
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
  { href: "/admin/alerts", icon: BellRing, label: "告警" },
  { href: "/admin/models", icon: BrainCircuit, label: "模型" },
  { href: "/admin/connections", icon: Plug, label: "工具连接" },
  { href: "/admin/storage", icon: HardDrive, label: "文件存储" },
  { href: "/admin/billing", icon: Banknote, label: "账务" },
  { href: "/admin/accounts", icon: UserRound, label: "账户与数据" },
];
const adminGroups = [
  { hrefs: ["/admin", "/admin/alerts"], label: "运营" },
  {
    hrefs: ["/admin/models", "/admin/connections", "/admin/storage"],
    label: "平台能力",
  },
  { hrefs: ["/admin/billing", "/admin/accounts"], label: "账户与账务" },
] as const;
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
      {adminGroups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.hrefs.map((href) => {
                const item = adminLinks.find((link) => link.href === href);
                if (!item) {
                  return null;
                }
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={current?.href === href}
                      tooltip={item.label}
                    >
                      <Link
                        aria-current={
                          current?.href === href ? "page" : undefined
                        }
                        href={href}
                        onClick={onNavigate}
                      >
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
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

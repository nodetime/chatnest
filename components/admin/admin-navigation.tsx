"use client";
import { HardDrive, Plug } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin/connections", icon: Plug, label: "工具连接" },
  { href: "/admin/storage", icon: HardDrive, label: "文件存储" },
];
export function AdminNavigationItems({ pathname }: { pathname: string }) {
  const current = pathname.replace(/^\/demo(?=\/)/, "");
  return (
    <nav aria-label="平台管理" className="space-y-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active = current === href;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium focus-visible:outline-2 ${active ? "bg-secondary" : "hover:bg-secondary"}`}
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </Link>
        );
      })}
      <p className="px-3 pt-3 text-xs leading-5 text-muted-foreground">
        平台级设置对所有用户生效。
      </p>
    </nav>
  );
}
export function AdminNavigation() {
  return (
    <AdminNavigationItems pathname={usePathname() ?? "/admin/connections"} />
  );
}

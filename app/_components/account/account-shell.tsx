"use client";

import {
  BarChart3,
  CreditCard,
  type LucideIcon,
  ReceiptText,
  Settings2,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ChangeEvent } from "react";
import { useCallback } from "react";
import { BrandMark } from "@/app/_components/brand-mark";

const personalNavigation = [
  { href: "/account", icon: BarChart3, label: "总览" },
  { href: "/account/billing", icon: CreditCard, label: "方案与余额" },
  { href: "/account/usage", icon: ReceiptText, label: "使用记录" },
  { href: "/account/settings", icon: Settings2, label: "设置" },
] as const;
function AccountNavLink({
  href,
  icon: Icon,
  label,
  pathname,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  pathname: string;
}) {
  const active =
    pathname === href ||
    (href !== "/account" && pathname.startsWith(`${href}/`));
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      href={href}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

export function AccountShell({
  children,
  isPlatformAdmin = false,
}: {
  children: React.ReactNode;
  isPlatformAdmin?: boolean;
}) {
  const pathname = usePathname() ?? "/account";
  const router = useRouter();
  const handleMobileNavigation = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      router.push(event.target.value);
    },
    [router]
  );
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <Link
            className="flex items-center gap-2 text-sm font-semibold"
            href="/"
          >
            <BrandMark size={28} />
            <span>数知探AI</span>
            <span className="font-normal text-muted-foreground">/</span>
            <span className="font-normal text-muted-foreground">个人账户</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              className="rounded-lg border border-border/70 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              href="/chat"
            >
              返回对话
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:hidden">
        <label className="sr-only" htmlFor="account-navigation">
          账户导航
        </label>
        <select
          aria-label="账户导航"
          className="h-10 w-full rounded-lg border border-border/70 bg-card px-3 text-sm shadow-sm"
          id="account-navigation"
          onChange={handleMobileNavigation}
          value={
            personalNavigation.some(
              (item) =>
                pathname === item.href ||
                (item.href !== "/account" &&
                  pathname.startsWith(`${item.href}/`))
            )
              ? (personalNavigation.find(
                  (item) =>
                    pathname === item.href ||
                    (item.href !== "/account" &&
                      pathname.startsWith(`${item.href}/`))
                )?.href ?? "/account")
              : "/account"
          }
        >
          {personalNavigation.map((item) => (
            <option key={item.href} value={item.href}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:px-8 lg:py-8">
        <aside
          aria-label="账户导航"
          className="hidden h-fit lg:block lg:sticky lg:top-6"
        >
          <div className="rounded-xl border border-border/70 bg-card p-2 shadow-sm">
            <div className="px-3 pb-2 pt-2">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                账户
              </p>
            </div>
            <nav className="space-y-0.5">
              {personalNavigation.map((item) => (
                <AccountNavLink {...item} key={item.href} pathname={pathname} />
              ))}
            </nav>
            {isPlatformAdmin ? (
              <>
                <div className="my-2 border-t border-border/60" />
                <Link
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  href="/admin"
                >
                  <Shield aria-hidden="true" className="size-4 shrink-0" />
                  <span>进入平台管理</span>
                </Link>
              </>
            ) : null}
          </div>
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}

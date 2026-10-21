import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNavigation } from "./admin-navigation";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <p className="text-xs font-medium tracking-widest text-muted-foreground">
              RESEARCH
            </p>
            <p className="mt-1 text-lg font-semibold">平台管理</p>
          </div>
          <Link
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2"
            href="/"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            返回工作台
          </Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 sm:px-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-10 md:py-10">
        <AdminNavigation />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

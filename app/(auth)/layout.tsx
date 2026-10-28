import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-svh flex-col bg-background"
      data-testid="auth-shell"
    >
      <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-8">
        <Link
          aria-label="ChatNest 首页"
          className="flex items-center gap-2 text-sm font-semibold"
          href="/"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs text-primary-foreground">
            C
          </span>
          ChatNest
        </Link>
        <Link
          className="flex items-center gap-1.5 rounded-md text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
          href="/"
        >
          <ArrowLeftIcon className="size-3.5" />
          返回首页
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pt-8 pb-20 sm:pb-28">
        <section
          aria-label="账户登录与注册"
          className="w-full max-w-sm space-y-2"
        >
          {children}
        </section>
      </main>
    </div>
  );
}

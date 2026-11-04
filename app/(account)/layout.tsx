import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountShell } from "@/app/_components/account/account-shell";
import { resolvePlatformAdmin } from "@/server/application/admin/access";
import { auth } from "../(auth)/auth";

async function AccountShellWithAccess({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.type !== "regular") {
    redirect("/login?next=%2Faccount");
  }
  return (
    <AccountShell isPlatformAdmin={await resolvePlatformAdmin(session?.user)}>
      {children}
    </AccountShell>
  );
}

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <AccountShell>
          <div
            aria-busy="true"
            className="min-h-48 rounded-xl border border-border/70 bg-card p-6 text-sm text-muted-foreground"
          >
            正在加载账户…
          </div>
        </AccountShell>
      }
    >
      <AccountShellWithAccess>{children}</AccountShellWithAccess>
    </Suspense>
  );
}

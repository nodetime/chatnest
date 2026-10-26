import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminShell } from "@/app/_components/admin/admin-shell";
import { auth } from "@/app/(auth)/auth";
import { requirePlatformAdmin } from "@/server/application/admin/access";

export const metadata: Metadata = {
  title: "ChatNest Admin",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <AuthorizedAdmin>{children}</AuthorizedAdmin>
    </Suspense>
  );
}

async function AuthorizedAdmin({ children }: { children: React.ReactNode }) {
  const session = await auth();
  requirePlatformAdmin(session?.user, notFound);
  return (
    <AdminShell
      identity={{
        email: session?.user?.email || "",
        name: session?.user?.name || session?.user?.email || "平台管理员",
      }}
    >
      {children}
    </AdminShell>
  );
}

import { cookies } from "next/headers";
import Script from "next/script";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { AppSidebar } from "@/app/_components/chat/app-sidebar";
import { DataStreamProvider } from "@/app/_components/chat/data-stream-provider";
import { ChatShell } from "@/app/_components/chat/shell";
import { WorkbenchSidebarProvider } from "@/app/_components/chat/workbench-sidebar-provider";
import { LandingDraftReceiver } from "@/app/_components/landing/draft-receiver";
import { HomeEntry } from "@/app/_components/landing/home-entry";
import { SidebarInset } from "@/app/_components/ui/sidebar";
import { ActiveChatProvider } from "@/app/_hooks/use-active-chat";
import { isPlatformAdmin } from "@/server/application/admin/access";
import { auth } from "../(auth)/auth";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DataStreamProvider>
      <Suspense fallback={<div className="flex h-dvh bg-sidebar" />}>
        <SidebarShell>{children}</SidebarShell>
      </Suspense>
    </DataStreamProvider>
  );
}

async function SidebarShell({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value === "false";

  return (
    <HomeEntry>
      <ActiveChatProvider ownerId={session?.user.id}>
        <Script
          src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
          strategy="lazyOnload"
        />
        <LandingDraftReceiver />
        <WorkbenchSidebarProvider
          className="chat-workbench"
          defaultOpen={!isCollapsed}
        >
          <AppSidebar
            isPlatformAdmin={isPlatformAdmin(session?.user)}
            user={session?.user}
          />
          <SidebarInset>
            <Toaster
              position="top-center"
              theme="system"
              toastOptions={{
                className:
                  "!bg-card !text-foreground !border-border/50 !shadow-[var(--shadow-float)]",
              }}
            />
            <Suspense fallback={<div className="flex h-dvh" />}>
              <ChatShell />
            </Suspense>
            {children}
          </SidebarInset>
        </WorkbenchSidebarProvider>
      </ActiveChatProvider>
    </HomeEntry>
  );
}

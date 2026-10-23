"use client";

import type { ComponentProps } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useActiveChat } from "@/hooks/use-active-chat";
import { useArtifact } from "@/hooks/use-artifact";
import { useWorkspace } from "@/hooks/use-workspace";

/** Only the chat shell opts into artifact focus; the saved sidebar choice survives. */
export function WorkbenchSidebarProvider(
  props: ComponentProps<typeof SidebarProvider>
) {
  const { chatId } = useActiveChat();
  const { artifact } = useArtifact();
  const workspace = useWorkspace();
  const focused =
    workspace.open &&
    workspace.tab === "document" &&
    artifact.isVisible &&
    artifact.documentId !== "init";
  return (
    <SidebarProvider
      {...props}
      temporaryCollapseKey={focused ? chatId : undefined}
    />
  );
}

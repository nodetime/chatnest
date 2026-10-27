"use client";
import type { ComponentProps } from "react";
import { SidebarProvider } from "@/app/_components/ui/sidebar";
/** Keep the user's sidebar choice when opening a general artifact. */
export function WorkbenchSidebarProvider(
  props: ComponentProps<typeof SidebarProvider>
) {
  return <SidebarProvider {...props} />;
}

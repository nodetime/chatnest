"use client";
import { useCallback } from "react";
import useSWR from "swr";

export type WorkbenchSection = "chat" | "files" | "connections" | "skills";
/** Presentation state only. Opening a library must not replace the running chat. */
export function useWorkbenchNavigation() {
  const { data: section = "chat", mutate } = useSWR<WorkbenchSection>(
    "workbench:section",
    null,
    { fallbackData: "chat" }
  );
  const navigate = useCallback(
    (next: WorkbenchSection) => {
      mutate(next, { revalidate: false });
    },
    [mutate]
  );
  return { navigate, section };
}

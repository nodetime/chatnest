"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback } from "react";
import useSWR from "swr";
import {
  isPersonalSection,
  personalLoginHref,
} from "@/app/_lib/auth-navigation";

export type WorkbenchSection = "chat" | "files" | "connections" | "skills";
/** Presentation state only. Opening a library must not replace the running chat. */
export function useWorkbenchNavigation() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const requested = search.get("section") ?? "";
  const initial = isPersonalSection(requested) ? requested : "chat";
  const { data: section = initial, mutate } = useSWR<WorkbenchSection>(
    ["workbench:section", session?.user?.id ?? "anonymous"],
    null,
    { fallbackData: initial }
  );
  const navigate = useCallback(
    (next: WorkbenchSection) => {
      if (isPersonalSection(next) && session?.user?.type !== "regular") {
        if (status !== "loading") {
          router.push(personalLoginHref(next));
        }
        return;
      }
      mutate(next, { revalidate: false });
      // Consume the login return target once. Later view changes stay local and
      // must not remount a running conversation or reset its input/attachments.
      if (search.has("section")) {
        const url = new URL(window.location.href);
        url.searchParams.delete("section");
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
        if (url.pathname === "/" || url.pathname === `${base}/`) {
          url.pathname = `${base}/chat`;
        }
        window.history.replaceState(
          null,
          "",
          url.pathname + url.search + url.hash
        );
      }
    },
    [mutate, router, search, session?.user?.type, status]
  );
  return { navigate, section };
}

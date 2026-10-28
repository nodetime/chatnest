"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { useActiveChat } from "@/app/_hooks/use-active-chat";
import { takeLandingDraft } from "./landing-draft";

export function LandingDraftReceiver() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { setInput } = useActiveChat();
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    if (
      status === "loading" ||
      !session?.user?.id ||
      (pathname !== "/chat" && pathname !== `${base}/chat`)
    ) {
      return;
    }
    // Let the existing per-owner draft hydrate first; never overwrite that draft.
    const frame = requestAnimationFrame(() => {
      try {
        const text = takeLandingDraft(sessionStorage, session.user);
        if (text) {
          setInput((current) =>
            current.trim() && current !== text ? `${current}\n\n${text}` : text
          );
        }
      } catch {
        toast.error("首页草稿暂时未能读取，已有草稿仍保留。");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, session?.user, setInput, status]);
  return null;
}

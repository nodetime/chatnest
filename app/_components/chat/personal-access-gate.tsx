"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Fragment, useEffect } from "react";
import {
  type PersonalSection,
  personalLoginHref,
} from "@/app/_lib/auth-navigation";

/** Covers settings tabs, direct return links and sessions expiring in a personal view. */
export function PersonalAccessGate({
  section,
  children,
}: {
  section: PersonalSection;
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const allowed =
    status === "authenticated" && session?.user?.type === "regular";
  useEffect(() => {
    if (status !== "loading" && !allowed) {
      router.replace(personalLoginHref(section));
    }
  }, [allowed, router, section, status]);
  return allowed ? <Fragment key={session.user.id}>{children}</Fragment> : null;
}

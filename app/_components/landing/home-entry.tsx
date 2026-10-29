"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { isPersonalSection } from "@/app/_lib/auth-navigation";
import { LandingPage } from "./landing-page";

/** The existing workspace stays mounted across its own routes and view changes. */
export function HomeEntry({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const isHome =
    pathname === "/" || pathname === base || pathname === `${base}/`;
  if (isHome && !isPersonalSection(search.get("section") ?? "")) {
    return <LandingPage />;
  }
  return children;
}

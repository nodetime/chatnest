import Link from "next/link";
import type { MouseEventHandler } from "react";
import { cn } from "@/app/_lib/utils";
import { BrandMark } from "./brand-mark";

export function BrandHomeLink({
  className,
  onClick,
}: {
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link
      aria-label="数知探AI 首页"
      className={cn(
        "inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold",
        className
      )}
      href="/"
      onClick={onClick}
    >
      <BrandMark />
      <span>数知探AI</span>
    </Link>
  );
}

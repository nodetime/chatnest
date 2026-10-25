import { Shield } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";

export function PlatformAdminLink({
  isPlatformAdmin,
  className,
  ...props
}: { isPlatformAdmin: boolean } & Omit<ComponentProps<typeof Link>, "href">) {
  if (!isPlatformAdmin) {
    return null;
  }
  return (
    <Link
      {...props}
      className={`flex items-center gap-2 ${className ?? ""}`}
      href="/admin"
    >
      <Shield aria-hidden="true" className="size-4" />
      平台管理
    </Link>
  );
}

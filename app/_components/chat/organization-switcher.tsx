"use client";

import { Building2, ChevronDown } from "lucide-react";
import Link from "next/link";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/app/_components/ui/button";

type PlatformOrganization = { id: number; name: string };

export function OrganizationSwitcher({ userType }: { userType?: string }) {
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>(
    []
  );
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    fetch("/api/organizations", { cache: "no-store" })
      .then(
        (response) =>
          response.json() as Promise<{
            organizations?: PlatformOrganization[];
            selectedOrganizationId?: string | null;
          }>
      )
      .then((payload) => {
        setOrganizations(payload.organizations ?? []);
        setSelected(payload.selectedOrganizationId ?? "");
      })
      .catch(() => undefined);
  }, []);

  const select = useCallback(async (organizationId: string) => {
    setSelected(organizationId);
    await fetch("/api/organizations/select", {
      body: JSON.stringify({ organizationId: organizationId || null }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    window.location.reload();
  }, []);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      select(event.target.value).catch(() => undefined);
    },
    [select]
  );

  if (userType !== "regular") {
    return null;
  }

  if (!organizations.length) {
    return (
      <Link
        className="flex items-center gap-2 px-1 text-xs text-muted-foreground hover:text-foreground"
        href="/account/organizations"
      >
        <Building2 className="size-3.5" />
        创建组织
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Building2 className="size-3.5 text-muted-foreground" />
      <select
        aria-label="切换组织"
        className="max-w-40 truncate bg-transparent text-xs font-medium outline-none"
        onChange={handleChange}
        value={selected}
      >
        <option value="">个人账户</option>
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
      <ChevronDown className="size-3 text-muted-foreground" />
      <Button asChild className="h-6 px-2 text-xs" size="xs" variant="ghost">
        <Link href="/account/organizations">组织设置</Link>
      </Button>
    </div>
  );
}

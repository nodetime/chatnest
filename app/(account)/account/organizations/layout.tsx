import { redirect } from "next/navigation";
import { getEnv, organizationsEnabled } from "@/server/shared/env";

export default function OrganizationAccountGate({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!organizationsEnabled(getEnv())) {
    redirect("/account");
  }
  return children;
}

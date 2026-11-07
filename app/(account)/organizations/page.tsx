import { redirect } from "next/navigation";

export default function LegacyOrganizationsPage() {
  redirect("/account/organizations");
}

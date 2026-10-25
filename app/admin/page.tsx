import { AdminOverview } from "@/app/_components/admin/admin-overview";
export default function AdminPage() {
  // The client island reads an independently authenticated, no-store admin API.
  return <AdminOverview />;
}

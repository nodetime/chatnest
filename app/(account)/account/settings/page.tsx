import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { getActiveModels } from "@/server/domain/model/models";
import { SettingsPageClient } from "./settings-page-client";

export default async function AccountSettingsPage() {
  const session = await auth();
  if (session?.user?.type !== "regular") {
    redirect("/login?next=%2Faccount%2Fsettings");
  }
  return (
    <SettingsPageClient
      models={getActiveModels().map((model) => ({
        id: model.id,
        name: model.name,
      }))}
      user={{
        email: session.user.email ?? "",
        name: session.user.name ?? null,
      }}
    />
  );
}

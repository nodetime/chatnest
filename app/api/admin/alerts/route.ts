import { auth } from "@/app/(auth)/auth";
import { resolvePlatformAdmin } from "@/server/application/admin/access";
import { createAlertsHandler } from "@/server/application/admin/alerts";
import { getUseCases } from "@/server/composition";

export const GET = createAlertsHandler({
  authorize: (user) => resolvePlatformAdmin(user),
  session: async () => (await auth())?.user,
  snapshot: (input) => getUseCases().admin.alertsSnapshot(input),
});

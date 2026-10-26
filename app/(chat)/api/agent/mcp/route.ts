import { auth } from "@/app/(auth)/auth";
import { createManagementHandler } from "@/server/application/mcp/api";
import { createSettingsService } from "@/server/application/mcp/service";
import { getUseCases } from "@/server/composition";

const handle = createManagementHandler({
  file: async () => (await getUseCases().agent.readConfig()).servers,
  service: createSettingsService(),
  session: async () => (await auth())?.user,
});
export const GET = handle;
export const POST = handle;

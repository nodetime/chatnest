import { auth } from "@/app/(auth)/auth";
import { readAgentConfig } from "@/server/agent/config";
import { createManagementHandler } from "@/server/agent/mcp-settings/api";
import { createSettingsService } from "@/server/agent/mcp-settings/service";

const handle = createManagementHandler({
  file: async () => (await readAgentConfig()).servers,
  service: createSettingsService(),
  session: async () => (await auth())?.user,
});
export const GET = handle;
export const POST = handle;

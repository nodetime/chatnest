import { auth } from "@/app/(auth)/auth";
import { readAgentConfig } from "@/lib/agent/config";
import { createManagementHandler } from "@/lib/agent/mcp-settings/api";
import { createSettingsService } from "@/lib/agent/mcp-settings/service";

const handle = createManagementHandler({
  file: async () => (await readAgentConfig()).servers,
  service: createSettingsService(),
  session: async () => (await auth())?.user,
});
export const GET = handle;
export const POST = handle;

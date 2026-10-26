import { auth } from "@/app/(auth)/auth";
import { createModelSettingsHandler } from "@/server/application/ai/model-settings/handler";

const handler = createModelSettingsHandler({
  session: async () => (await auth())?.user,
});
export const GET = handler;
export const POST = handler;

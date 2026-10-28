import { auth } from "@/app/(auth)/auth";
import { createPersonalSkillsHandler } from "@/server/application/capability/api";

const handle = createPersonalSkillsHandler({
  session: async () => (await auth())?.user,
});
export const GET = handle;
export const POST = handle;

import { auth } from "@/app/(auth)/auth";
import { createPersonalScopeHandler } from "@/server/application/capability/api";

const handle = createPersonalScopeHandler({
  session: async () => (await auth())?.user,
});
export const GET = handle;

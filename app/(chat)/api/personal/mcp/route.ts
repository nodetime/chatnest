import { auth } from "@/app/(auth)/auth";
import { createPersonalMcpHandler } from "@/server/application/capability/api";

const handle = createPersonalMcpHandler({
  session: async () => (await auth())?.user,
});
export const GET = handle;
export const POST = handle;

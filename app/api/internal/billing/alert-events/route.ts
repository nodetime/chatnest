import { createAlertEventHandler } from "@/server/application/admin/alert-history";
import { getUseCases } from "@/server/composition";
import { getEnv } from "@/server/shared/env";
export const POST = createAlertEventHandler({
  authorized: (request) => {
    const token = getEnv().CHATNEST_CONTROL_TOKEN;
    return Boolean(
      token && request.headers.get("x-chatnest-control-token") === token
    );
  },
  record: (input) => getUseCases().admin.recordAlertEvent(input),
});

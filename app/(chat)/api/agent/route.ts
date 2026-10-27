import { headers } from "next/headers";
import { auth } from "@/app/(auth)/auth";
import { getModelConnection } from "@/server/application/ai/model-connection";
import { withModelSettings } from "@/server/application/ai/model-settings/runtime";
import { readUserCatalog } from "@/server/application/capability/runtime";
import { capabilityServers } from "@/server/application/mcp/projection";
import { isAdmin, managementReady } from "@/server/application/mcp/security";
import { uploadsAvailable } from "@/server/application/uploads/service";
import { getLogger } from "@/server/shared/logger";
import { runWithTraceId } from "@/server/shared/request-context";

export async function GET() {
  // proxy.ts 注入的 x-trace-id 进入 ALS,本请求内 logger 自动携带
  const traceId = (await headers()).get("x-trace-id") ?? "no-trace";
  return runWithTraceId(traceId, handleAgentSummary);
}

async function handleAgentSummary() {
  const user = (await auth())?.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  getLogger("agent").info({ userId: user.id }, "agent 能力摘要请求");
  try {
    const { config, skills } = await readUserCatalog(user);
    return await withModelSettings(async () =>
      Response.json(
        {
          limits: { maxSteps: config.maxSteps, timeoutMs: config.timeoutMs },
          mcpManagement: {
            admin: isAdmin(user),
            configured: managementReady(),
          },
          modelConfigured: getModelConnection().configured,
          modelProvider: getModelConnection().provider,
          servers: capabilityServers(config.servers),
          skills: skills.map(
            ({
              id,
              source,
              name,
              description,
              displayName,
              shortDescription,
            }) => ({
              description,
              displayName,
              enabled: true,
              id: id ?? `builtin:${name}`,
              name,
              shortDescription,
              source: source ?? "builtin",
            })
          ),
          uploadsConfigured: await uploadsAvailable(),
        },
        { headers: { "Cache-Control": "private, no-store" } }
      )
    );
  } catch {
    return Response.json(
      { error: "Agent 配置无法读取，请检查配置文件和技能目录。" },
      { status: 500 }
    );
  }
}

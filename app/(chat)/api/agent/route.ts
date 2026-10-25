import { headers } from "next/headers";
import { auth } from "@/app/(auth)/auth";
import { capabilityServers } from "@/server/agent/mcp-settings/projection";
import { readRuntimeConfig } from "@/server/agent/mcp-settings/runtime-config";
import { isAdmin, managementReady } from "@/server/agent/mcp-settings/security";
import { discoverSkills } from "@/server/agent/skills";
import { getModelConnection } from "@/server/ai/model-connection";
import { withModelSettings } from "@/server/ai/model-settings/runtime";
import { getLogger } from "@/server/shared/logger";
import { runWithTraceId } from "@/server/shared/request-context";
import { uploadsAvailable } from "@/server/uploads/service";

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
    const [config, skills] = await Promise.all([
      readRuntimeConfig(),
      discoverSkills(),
    ]);
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
            ({ name, description, displayName, shortDescription }) => ({
              description,
              displayName,
              name,
              shortDescription,
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

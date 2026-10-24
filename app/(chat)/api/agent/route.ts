import { auth } from "@/app/(auth)/auth";
import { capabilityServers } from "@/lib/agent/mcp-settings/projection";
import { readRuntimeConfig } from "@/lib/agent/mcp-settings/runtime-config";
import { isAdmin, managementReady } from "@/lib/agent/mcp-settings/security";
import { discoverSkills } from "@/lib/agent/skills";
import { getModelConnection } from "@/lib/ai/model-connection";
import { withModelSettings } from "@/lib/ai/model-settings/runtime";
import { uploadsAvailable } from "@/lib/uploads/service";

export async function GET() {
  const user = (await auth())?.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
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

import { connection } from "next/server";
import {
  getModelConnection,
  getRuntimeModels,
} from "@/server/ai/model-connection";
import { getCapabilities } from "@/server/ai/model-service";
import { withModelSettings } from "@/server/ai/model-settings/runtime";
import { getAllGatewayModels, isDemo } from "@/server/ai/models";

export async function GET() {
  try {
    return await withModelSettings(readModels);
  } catch {
    return Response.json(
      { error: "模型配置读取失败，请联系管理员。" },
      { headers: { "Cache-Control": "no-store" }, status: 503 }
    );
  }
}
async function readModels() {
  await connection();
  const headers = {
    "Cache-Control": "no-store",
  };

  const curatedCapabilities = await getCapabilities();
  if (getModelConnection().provider === "openai") {
    return Response.json(
      {
        capabilities: curatedCapabilities,
        defaultModelId: getModelConnection().modelId,
        models: getRuntimeModels(),
        selectableModelIds: getRuntimeModels().map((model) => model.id),
      },
      { headers }
    );
  }

  if (isDemo) {
    const models = await getAllGatewayModels();
    const capabilities = Object.fromEntries(
      models.map((m) => [m.id, curatedCapabilities[m.id] ?? m.capabilities])
    );

    return Response.json({ capabilities, models }, { headers });
  }

  return Response.json(curatedCapabilities, { headers });
}

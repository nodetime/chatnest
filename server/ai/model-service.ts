import {
  getDirectCapabilities,
  getModelConnection,
} from "@/server/ai/model-connection";
import {
  getModelAvailability as getGatewayAvailability,
  getCapabilities as getGatewayCapabilities,
} from "@/server/ai/models";

export function getCapabilities() {
  return getModelConnection().provider === "openai"
    ? Promise.resolve(getDirectCapabilities())
    : getGatewayCapabilities();
}

export function getModelAvailability(modelId: string) {
  return getModelConnection().provider === "openai"
    ? Promise.resolve("unknown" as const)
    : getGatewayAvailability(modelId);
}

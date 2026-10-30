import { z } from "zod";
import { type DecimalString, decimalStringSchema } from "./types";

const chargeModeSchema = z.enum(["attempt", "success"]);

const fixedCallPolicySchema = z.object({
  chargeMode: chargeModeSchema,
  kind: z.literal("fixed_call"),
  points: decimalStringSchema,
  unit: z.literal("call"),
});

const tieredCallPolicySchema = z.object({
  chargeMode: chargeModeSchema,
  dimension: z.enum(["mode", "operation", "quality"]),
  kind: z.literal("tiered_call"),
  tiers: z.record(z.string().min(1), decimalStringSchema),
});

const reportedUnitPolicySchema = z.object({
  chargeMode: chargeModeSchema,
  kind: z.literal("reported_unit"),
  overage: z.enum(["manual_review", "platform_absorb"]),
  pointsPerUnit: decimalStringSchema,
  reserve: z.object({
    capUnits: decimalStringSchema,
    strategy: z.enum(["fixed_cap", "max_from_dimensions"]),
  }),
  unit: z.enum(["credit", "page", "record", "url"]),
});

const includedPolicySchema = z.object({
  kind: z.literal("included"),
  points: z.literal("0"),
  unit: z.literal("call"),
});

const metadataPolicySchema = z.object({ kind: z.literal("metadata") });
const quoteRequiredPolicySchema = z.object({
  kind: z.literal("quote_required"),
});

export const toolPricePolicySchema = z.discriminatedUnion("kind", [
  fixedCallPolicySchema,
  tieredCallPolicySchema,
  reportedUnitPolicySchema,
  includedPolicySchema,
  metadataPolicySchema,
  quoteRequiredPolicySchema,
]);

export type ToolPricePolicy = z.infer<typeof toolPricePolicySchema>;
export type ToolPriceCatalog = {
  default: "deny";
  tools: Record<string, ToolPricePolicy>;
  version: string;
};

function assertPolicyPoints(policy: ToolPricePolicy): ToolPricePolicy {
  const parsed = toolPricePolicySchema.parse(policy);
  if (parsed.kind === "reported_unit" && parsed.reserve.capUnits === "0") {
    throw new Error("reported_unit capUnits must be positive");
  }
  return parsed;
}

export function resolveToolPrice(
  catalog: ToolPriceCatalog,
  canonicalToolKey: string
): ToolPricePolicy | null {
  if (catalog?.default !== "deny") {
    throw new Error("Tool price catalog must use default=deny");
  }
  const policy = catalog.tools[canonicalToolKey];
  if (!policy) {
    return null;
  }
  return assertPolicyPoints(policy);
}

export function pointsToBigInt(points: DecimalString): bigint {
  return BigInt(points);
}

export function settleReportedUnits(
  policy: Extract<ToolPricePolicy, { kind: "reported_unit" }>,
  actualUnits: string
): { actualPoints: string; overage: boolean; surplusPoints: string } {
  if (!/^(?:0|[1-9]\d{0,18})$/.test(actualUnits)) {
    throw new Error("actual units must be a non-negative integer string");
  }
  const actual = BigInt(actualUnits);
  const cap = BigInt(policy.reserve.capUnits);
  const pointsPerUnit = BigInt(policy.pointsPerUnit);
  const actualPoints = actual * pointsPerUnit;
  const reservedPoints = cap * pointsPerUnit;
  return {
    actualPoints: String(actualPoints),
    overage: actual > cap,
    surplusPoints: actual > cap ? "0" : String(reservedPoints - actualPoints),
  };
}

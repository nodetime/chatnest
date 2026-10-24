import { z } from "zod";
export const modelSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[\w./:@+-]+$/),
    tools: z.boolean(),
    vision: z.boolean(),
  })
  .strict();
export const configurationSchema = z
  .object({
    apiMode: z.enum(["chat", "responses"]),
    baseURL: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .transform((v) => v.replace(/\/+$/, "")),
    defaultModel: z.string().min(1).max(200),
    models: z.array(modelSchema).min(1).max(32),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.models.map((m) => m.id)).size === v.models.length &&
      v.models.some((m) => m.id === v.defaultModel)
  );
export const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .regex(/^[\x21-\x7e]+$/);
export const editSchema = z
  .object({
    config: configurationSchema,
    key: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("keep") }).strict(),
      z.object({ mode: z.literal("replace"), value: keySchema }).strict(),
    ]),
    revision: z.number().int().min(0).max(2_147_483_646),
  })
  .strict();
export type ModelConfiguration = z.infer<typeof configurationSchema>;
export type ModelEdit = z.infer<typeof editSchema>;
export type PrivateModelSettings = ModelConfiguration & { apiKey: string };
export type ModelSettingsProjection = {
  config: ModelConfiguration;
  hasKey: boolean;
  configured: boolean;
  source: "environment" | "managed";
  revision: number;
  manageable: boolean;
};
export type ProbeResult = {
  ok: boolean;
  message: string;
  status?: number;
  latencyMs?: number;
};

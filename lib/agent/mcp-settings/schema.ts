import { z } from "zod";
export const MAX_BODY_BYTES = 32_768;
export const toolNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_.-]+$/);
export const idSchema = z.string().regex(/^[a-z][a-z0-9_]{0,30}$/);
const forbiddenHeaders = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
  "cookie",
  "set-cookie",
  "content-length",
  "origin",
  "referer",
  "accept",
  "content-type",
  "mcp-session-id",
  "mcp-protocol-version",
  "last-event-id",
]);
export const connectionSchema = z
  .object({
    headers: z
      .record(
        z
          .string()
          .regex(/^[!#$%&'*+.^_`|~0-9a-zA-Z-]+$/)
          .max(100),
        z
          .string()
          .max(4096)
          .refine((v) => !/[\r\n]/u.test(v) && !v.includes("${"))
      )
      .default({})
      .superRefine((headers, ctx) => {
        const names = Object.keys(headers).map((n) => n.toLowerCase());
        if (
          names.length > 16 ||
          new Set(names).size !== names.length ||
          names.some(
            (n) =>
              forbiddenHeaders.has(n) ||
              n.startsWith("proxy-") ||
              n.startsWith("sec-")
          )
        ) {
          ctx.addIssue({ code: "custom", message: "Unsupported headers" });
        }
      }),
    url: z
      .string()
      .min(1)
      .max(4096)
      .refine((v) => !/[\s\\]/u.test(v) && !v.includes("${")),
  })
  .strict();
const connectionEditSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("keep") }).strict(),
  z.object({ mode: z.literal("replace"), value: connectionSchema }).strict(),
]);
const revision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
export const managedServerSchema = connectionSchema.extend({
  allowedTools: z
    .array(toolNameSchema)
    .max(128)
    .refine((a) => new Set(a).size === a.length),
  enabled: z.boolean(),
  id: idSchema,
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((v) => ![...v].some((character) => character.charCodeAt(0) < 32)),
});
export const managedListSchema = z.array(managedServerSchema).max(8);
export const actionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("test"),
      connection: connectionEditSchema,
      id: idSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("save"),
      revision,
      server: z
        .object({
          allowedTools: managedServerSchema.shape.allowedTools,
          connection: connectionEditSchema,
          enabled: z.boolean(),
          id: idSchema,
          name: managedServerSchema.shape.name,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("toggle"),
      enabled: z.boolean(),
      id: idSchema,
      revision,
    })
    .strict(),
  z.object({ action: z.literal("delete"), id: idSchema, revision }).strict(),
]);
export function parseImport(text: string) {
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new Error("Import is too large");
  }
  const input = z
    .object({
      mcpServers: z.record(
        z
          .string()
          .min(1)
          .max(80)
          .refine(
            (v) => ![...v].some((character) => character.charCodeAt(0) < 32)
          ),
        connectionSchema
      ),
    })
    .strict()
    .parse(JSON.parse(text));
  const entries = Object.entries(input.mcpServers);
  if (entries.length !== 1) {
    throw new Error("Import exactly one HTTP server");
  }
  const [name, connection] = entries[0];
  const id = idSchema.safeParse(name).success
    ? name
    : `mcp_${name.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`.slice(0, 31);
  return { connection, id, name };
}

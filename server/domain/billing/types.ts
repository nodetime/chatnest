import { z } from "zod";

export type Brand<T, Name extends string> = T & {
  readonly __brand: Name;
};

export type OperationId = Brand<string, "OperationId">;
export type AttemptId = Brand<string, "AttemptId">;
export type HoldId = Brand<string, "HoldId">;
export type ReceiptId = Brand<string, "ReceiptId">;
export type DecimalString = Brand<string, "DecimalString">;

export const decimalStringSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,18})$/, "Expected a non-negative integer string")
  .transform((value) => value as DecimalString);

export const toolIdentitySchema = z.object({
  api: z.string().min(1).max(128),
  platform: z.string().min(1).max(128),
  provider: z.string().min(1).max(128),
});

export type ToolIdentity = z.infer<typeof toolIdentitySchema>;

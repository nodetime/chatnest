import { z } from "zod";

export const executeCodeInputSchema = z.object({
  code: z.string().min(1).max(16_000),
});

export const executeCodeOutputSchema = z.object({
  error: z.string().max(1000).optional(),
  logs: z.array(z.string().max(1000)).max(20),
  result: z.unknown().optional(),
  status: z.enum(["completed", "failed"]),
});

export type ExecuteCodeOutput = z.infer<typeof executeCodeOutputSchema>;

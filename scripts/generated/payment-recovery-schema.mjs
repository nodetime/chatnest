/** Generated from platform-points/source.json + manifest.json. Do not edit. */
import { z } from "zod";
export const PaymentRecoveryWireSchema = z
  .object({
    caseRisk: z
      .object({
        dueSoonOrOverdue: z.number().refine(Number.isInteger).min(0),
        total: z.number().refine(Number.isInteger).min(0),
        withGap: z.number().refine(Number.isInteger).min(0),
      })
      .strict(),
    events: z
      .array(
        z
          .object({
            eventId: z.string(),
            status: z.number().refine(Number.isInteger).min(100).max(599),
          })
          .strict()
      )
      .max(100),
    failed: z.number().refine(Number.isInteger).min(0).max(100),
    reconciled: z.number().refine(Number.isInteger).min(0).max(100),
    staleBefore: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
  })
  .strict();

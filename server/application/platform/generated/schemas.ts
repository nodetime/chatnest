/** Generated from platform-points/source.json + manifest.json. Do not edit. */
import { z } from "zod";
export const AdminPaymentAttentionSchema = z
  .object({
    amountCents: z.union([
      z.number().refine(Number.isInteger).min(0).max(9_007_199_254_740_991),
      z.null(),
    ]),
    createdAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    currency: z.union([
      z.string().refine((value2) => [...value2].length <= 16),
      z.null(),
    ]),
    eventType: z.string().refine((value1) => [...value1].length <= 128),
    failureReason: z.union([
      z.string().refine((value2) => [...value2].length <= 200),
      z.null(),
    ]),
    paymentEventId: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(2_147_483_647),
    status: z.intersection(
      z.string(),
      z.union([
        z.literal("failed"),
        z.literal("received"),
        z.literal("processing"),
        z.literal("refund_due"),
      ])
    ),
  })
  .strict();
export const AdminBillingOverviewSchema = z
  .object({
    adminId: z.number().refine(Number.isInteger).min(1).optional(),
    adminRole: z.intersection(
      z.string(),
      z.union([z.literal("admin"), z.literal("operator")])
    ),
    balancePoints: z.union([
      z.string().regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u),
      z.null(),
    ]),
    capturedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u),
    nextCursor: z.union([
      z.string().refine((value2) => [...value2].length <= 256),
      z.null(),
    ]),
    operationCount: z.number().refine(Number.isInteger).min(0),
    organizationBalancePoints: z.union([
      z.string().regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u),
      z.null(),
    ]),
    organizationWalletCount: z
      .number()
      .refine(Number.isInteger)
      .min(0)
      .optional(),
    payment: z
      .object({
        failed: z.number().refine(Number.isInteger).min(0),
        ignored: z.number().refine(Number.isInteger).min(0),
        inboxCount: z.number().refine(Number.isInteger).min(0),
        processed: z.number().refine(Number.isInteger).min(0),
        processing: z.number().refine(Number.isInteger).min(0),
        received: z.number().refine(Number.isInteger).min(0),
        refundDue: z.number().refine(Number.isInteger).min(0),
        successRate: z.number().min(0).max(100),
        webhookLagSeconds: z.number().refine(Number.isInteger).min(0),
      })
      .strict(),
    paymentAttention: z
      .array(
        z
          .object({
            amountCents: z.union([
              z
                .number()
                .refine(Number.isInteger)
                .min(0)
                .max(9_007_199_254_740_991),
              z.null(),
            ]),
            createdAt: z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            currency: z.union([
              z.string().refine((value5) => [...value5].length <= 16),
              z.null(),
            ]),
            eventType: z.string().refine((value4) => [...value4].length <= 128),
            failureReason: z.union([
              z.string().refine((value5) => [...value5].length <= 200),
              z.null(),
            ]),
            paymentEventId: z
              .number()
              .refine(Number.isInteger)
              .min(1)
              .max(2_147_483_647),
            status: z.intersection(
              z.string(),
              z.union([
                z.literal("failed"),
                z.literal("received"),
                z.literal("processing"),
                z.literal("refund_due"),
              ])
            ),
          })
          .strict()
      )
      .max(20),
    paymentCases: z
      .object({
        dueSoonOrOverdue: z.number().refine(Number.isInteger).min(0),
        items: z
          .array(
            z
              .object({
                caseCount: z.number().refine(Number.isInteger).min(1),
                checkoutId: z
                  .string()
                  .refine((value4) => [...value4].length >= 1)
                  .refine((value4) => [...value4].length <= 256),
                disputedPoints: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                disputeGapPoints: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                dueAt: z.union([
                  z
                    .string()
                    .regex(
                      /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                    )
                    .datetime({ offset: true }),
                  z.null(),
                ]),
                refundGapPoints: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                reviewRequired: z.boolean(),
                sourcePaymentEventId: z
                  .number()
                  .refine(Number.isInteger)
                  .min(1)
                  .max(2_147_483_647),
              })
              .strict()
          )
          .max(20),
        total: z.number().refine(Number.isInteger).min(0),
        withGap: z.number().refine(Number.isInteger).min(0),
      })
      .strict(),
    personalBalancePoints: z.union([
      z.string().regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u),
      z.null(),
    ]),
    policyCount: z.number().refine(Number.isInteger).min(0),
    recentOperations: z
      .array(
        z
          .object({
            attemptId: z.string(),
            canonicalToolKey: z.string(),
            capturedPoints: z.string(),
            createdAt: z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            operationId: z.string(),
            reservedPoints: z.string(),
            sessionGroupId: z.string(),
            state: z.intersection(
              z.string(),
              z.union([
                z.literal("reserved"),
                z.literal("dispatched"),
                z.literal("settled"),
                z.literal("released"),
                z.literal("reconcile_pending"),
                z.literal("overage_pending"),
              ])
            ),
            subjectType: z.intersection(
              z.string(),
              z.union([z.literal("model"), z.literal("tool")])
            ),
            updatedAt: z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
          })
          .strict()
      )
      .max(100),
    reconcilePending: z.number().refine(Number.isInteger).min(0),
    requestId: z.string().optional(),
    states: z.record(z.string(), z.number().refine(Number.isInteger).min(0)),
    walletAccounting: z
      .object({
        active: z
          .number()
          .refine(Number.isInteger)
          .min(0)
          .max(9_007_199_254_740_991),
        frozen: z
          .number()
          .refine(Number.isInteger)
          .min(0)
          .max(9_007_199_254_740_991),
        invalid: z
          .number()
          .refine(Number.isInteger)
          .min(0)
          .max(9_007_199_254_740_991),
        missing: z
          .number()
          .refine(Number.isInteger)
          .min(0)
          .max(9_007_199_254_740_991),
        staged: z
          .number()
          .refine(Number.isInteger)
          .min(0)
          .max(9_007_199_254_740_991),
      })
      .strict(),
  })
  .strict();
export const IdentityExchangeRequestSchema = z
  .object({
    audience: z.intersection(z.string(), z.literal("platform-billing")),
    displayName: z
      .string()
      .refine((value1) => [...value1].length <= 256)
      .optional(),
    issuer: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256),
    subject: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256),
  })
  .strict();
export const OperationReserveRequestSchema = z
  .object({
    attemptId: z
      .string()
      .refine((value2) => [...value2].length >= 1)
      .refine((value2) => [...value2].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?!\.{1,2}(?![\s\S]))[^\u0000\uD800-\uDFFF]+$/u
      ),
    billingDimensions: z.object({}).passthrough().optional(),
    canonicalToolKey: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 512)
      .optional(),
    modelId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256)
      .optional(),
    operationId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
    organizationId: z
      .union([
        z.string().refine((value2) => [...value2].length <= 64),
        z.number(),
        z.null(),
      ])
      .optional(),
    policyRevision: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .optional(),
    runId: z.string().optional(),
    sessionGroupId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256),
    stepIndex: z.number().refine(Number.isInteger).min(0).optional(),
    subjectId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 512)
      .optional(),
    subjectType: z.intersection(
      z.string(),
      z.union([z.literal("model"), z.literal("tool")])
    ),
    tool: z
      .object({
        api: z
          .string()
          .refine((value2) => [...value2].length >= 1)
          .refine((value2) => [...value2].length <= 128),
        platform: z
          .string()
          .refine((value2) => [...value2].length >= 1)
          .refine((value2) => [...value2].length <= 128),
        provider: z
          .string()
          .refine((value2) => [...value2].length >= 1)
          .refine((value2) => [...value2].length <= 128),
      })
      .strict()
      .optional(),
  })
  .strict();
export const OperationReserveResponseSchema = z
  .object({
    holdId: z.string(),
    priceVersion: z.string().optional(),
    requestId: z.string().optional(),
    reservedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
  })
  .strict();
export const OperationDispatchResponseSchema = z
  .object({
    permit: z.string().refine((value1) => [...value1].length >= 1),
    requestId: z.string().optional(),
  })
  .strict();
export const OperationReportRequestSchema = z
  .object({
    attemptId: z
      .string()
      .refine((value2) => [...value2].length >= 1)
      .refine((value2) => [...value2].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?!\.{1,2}(?![\s\S]))[^\u0000\uD800-\uDFFF]+$/u
      ),
    executionReceipt: z
      .union([
        z
          .object({
            attemptId: z
              .string()
              .refine((value5) => [...value5].length >= 1)
              .refine((value5) => [...value5].length <= 128)
              .regex(
                // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                /^(?!\.{1,2}(?![\s\S]))[^\u0000\uD800-\uDFFF]+$/u
              ),
            canonicalToolKey: z
              .string()
              .refine((value4) => [...value4].length >= 1)
              .refine((value4) => [...value4].length <= 512),
            dispatchEvidence: z.union([
              z.literal("not_dispatched"),
              z.literal("started"),
              z.literal("response"),
              z.literal("unknown"),
            ]),
            httpStatus: z.union([
              z.number().refine(Number.isInteger).min(100).max(599),
              z.null(),
            ]),
            operationId: z
              .string()
              .refine((value4) => [...value4].length >= 1)
              .refine((value4) => [...value4].length <= 128),
            outcome: z.union([
              z.literal("response"),
              z.literal("timeout"),
              z.literal("cancelled"),
              z.literal("network_error"),
              z.literal("response_too_large"),
            ]),
            receiptId: z
              .string()
              .refine((value4) => [...value4].length >= 1)
              .refine((value4) => [...value4].length <= 128),
            receiptRevision: z.number().refine(Number.isInteger).min(1),
            signature: z
              .string()
              .refine((value4) => [...value4].length >= 1)
              .refine((value4) => [...value4].length <= 2048)
              .optional(),
            supplierUnits: z.record(
              z.string().refine((value5) => [...value5].length <= 128),
              z.string().refine((value5) => [...value5].length <= 128)
            ),
          })
          .strict(),
        z.null(),
      ])
      .refine(
        (value1) =>
          [
            z
              .object({
                attemptId: z
                  .string()
                  .refine((value5) => [...value5].length >= 1)
                  .refine((value5) => [...value5].length <= 128)
                  .regex(
                    // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                    /^(?!\.{1,2}(?![\s\S]))[^\u0000\uD800-\uDFFF]+$/u
                  ),
                canonicalToolKey: z
                  .string()
                  .refine((value4) => [...value4].length >= 1)
                  .refine((value4) => [...value4].length <= 512),
                dispatchEvidence: z.union([
                  z.literal("not_dispatched"),
                  z.literal("started"),
                  z.literal("response"),
                  z.literal("unknown"),
                ]),
                httpStatus: z.union([
                  z.number().refine(Number.isInteger).min(100).max(599),
                  z.null(),
                ]),
                operationId: z
                  .string()
                  .refine((value4) => [...value4].length >= 1)
                  .refine((value4) => [...value4].length <= 128),
                outcome: z.union([
                  z.literal("response"),
                  z.literal("timeout"),
                  z.literal("cancelled"),
                  z.literal("network_error"),
                  z.literal("response_too_large"),
                ]),
                receiptId: z
                  .string()
                  .refine((value4) => [...value4].length >= 1)
                  .refine((value4) => [...value4].length <= 128),
                receiptRevision: z.number().refine(Number.isInteger).min(1),
                signature: z
                  .string()
                  .refine((value4) => [...value4].length >= 1)
                  .refine((value4) => [...value4].length <= 2048)
                  .optional(),
                supplierUnits: z.record(
                  z.string().refine((value5) => [...value5].length <= 128),
                  z.string().refine((value5) => [...value5].length <= 128)
                ),
              })
              .strict(),
            z.null(),
          ].filter((validator) => validator.safeParse(value1).success)
            .length === 1
      )
      .optional(),
    operationId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
    outcome: z.intersection(
      z.string(),
      z.union([
        z.literal("response"),
        z.literal("failed"),
        z.literal("unknown"),
      ])
    ),
    usage: z
      .union([
        z
          .object({
            inputTokens: z
              .number()
              .refine(Number.isInteger)
              .min(0)
              .max(9_007_199_254_740_991)
              .optional(),
            outputTokens: z
              .number()
              .refine(Number.isInteger)
              .min(0)
              .max(9_007_199_254_740_991)
              .optional(),
          })
          .strict(),
        z.null(),
      ])
      .optional(),
  })
  .strict();
export const ExecutionReceiptSchema = z
  .object({
    attemptId: z
      .string()
      .refine((value2) => [...value2].length >= 1)
      .refine((value2) => [...value2].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?!\.{1,2}(?![\s\S]))[^\u0000\uD800-\uDFFF]+$/u
      ),
    canonicalToolKey: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 512),
    dispatchEvidence: z.union([
      z.literal("not_dispatched"),
      z.literal("started"),
      z.literal("response"),
      z.literal("unknown"),
    ]),
    httpStatus: z.union([
      z.number().refine(Number.isInteger).min(100).max(599),
      z.null(),
    ]),
    operationId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
    outcome: z.union([
      z.literal("response"),
      z.literal("timeout"),
      z.literal("cancelled"),
      z.literal("network_error"),
      z.literal("response_too_large"),
    ]),
    receiptId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
    receiptRevision: z.number().refine(Number.isInteger).min(1),
    signature: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 2048)
      .optional(),
    supplierUnits: z.record(
      z.string().refine((value2) => [...value2].length <= 128),
      z.string().refine((value2) => [...value2].length <= 128)
    ),
  })
  .strict();
export const OperationReportResponseSchema = z
  .object({
    requestId: z.string().optional(),
    state: z.intersection(
      z.string(),
      z.union([
        z.literal("settled"),
        z.literal("reconcile_pending"),
        z.literal("released"),
        z.literal("overage_pending"),
      ])
    ),
  })
  .strict();
export const CheckoutStatusSchema = z
  .object({
    amountCents: z
      .number()
      .refine(Number.isInteger)
      .min(0)
      .max(9_007_199_254_740_991),
    checkoutId: z.string(),
    createdAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    creditedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    currency: z.string(),
    organizationId: z.union([
      z.number().refine(Number.isInteger).min(1),
      z.null(),
    ]),
    paymentPosition: z.union([
      z
        .object({
          consumedPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          disputedPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          expiredPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          heldPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          restrictedPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          reviewRequired: z.boolean(),
          spendablePoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
        })
        .strict(),
      z.null(),
    ]),
    plan: z.union([
      z
        .object({
          monthlyPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          name: z.string(),
          slug: z.string(),
        })
        .strict(),
      z.null(),
    ]),
    priceVersion: z.union([z.string(), z.null()]),
    refundAttention: z.intersection(
      z.string(),
      z.union([
        z.literal("none"),
        z.literal("pending"),
        z.literal("review_required"),
      ])
    ),
    refundedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    refundRecovery: z.union([
      z
        .object({
          availablePoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u),
          decisions: z
            .number()
            .refine(Number.isInteger)
            .min(1)
            .max(2_147_483_647),
          expiredPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u),
          recoveredPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u),
        })
        .strict(),
      z.null(),
    ]),
    requestId: z.string(),
    status: z.intersection(
      z.string(),
      z.union([
        z.literal("created"),
        z.literal("pending"),
        z.literal("completed"),
        z.literal("failed"),
        z.literal("expired"),
        z.literal("canceled"),
        z.literal("partially_refunded"),
        z.literal("refunded"),
      ])
    ),
    updatedAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
  })
  .strict();
export const CheckoutPointAmountSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u);
export const PaymentWebhookSchema = z
  .object({
    amountCents: z
      .number()
      .refine(Number.isInteger)
      .min(0)
      .max(9_007_199_254_740_991)
      .optional(),
    cancelAtPeriodEnd: z.boolean().optional(),
    checkoutId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    currency: z
      .string()
      .regex(/^[A-Za-z]{3}$/u)
      .optional(),
    currentPeriodEnd: z
      .union([
        z
          .string()
          .regex(
            /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
          )
          .datetime({ offset: true }),
        z.null(),
      ])
      .optional(),
    currentPeriodStart: z
      .union([
        z
          .string()
          .regex(
            /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
          )
          .datetime({ offset: true }),
        z.null(),
      ])
      .optional(),
    customerRef: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    eventType: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      ),
    expiresAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true })
      .optional(),
    grossAmountMinor: z
      .number()
      .refine(Number.isInteger)
      .min(0)
      .max(9_007_199_254_740_991)
      .optional(),
    metadata: z.object({}).passthrough().optional(),
    occurredAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true })
      .optional(),
    organizationId: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(9_007_199_254_740_991)
      .optional(),
    planSlug: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    points: z
      .union([
        z.string().regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
        z.number().refine(Number.isInteger).min(0).max(9_007_199_254_740_991),
      ])
      .optional(),
    providerAccount: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    providerEventId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      ),
    refundAmountMinor: z
      .number()
      .refine(Number.isInteger)
      .min(0)
      .max(9_007_199_254_740_991)
      .optional(),
    refundedGrantPoints: z
      .union([
        z.string().regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
        z.number().refine(Number.isInteger).min(0).max(9_007_199_254_740_991),
      ])
      .optional(),
    refundId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    signature: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 2048)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    status: z
      .intersection(
        z.string(),
        z.union([
          z.literal("trialing"),
          z.literal("active"),
          z.literal("past_due"),
          z.literal("canceled"),
          z.literal("incomplete"),
        ])
      )
      .optional(),
    subscriptionId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    userId: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(9_007_199_254_740_991)
      .optional(),
  })
  .strict();
export const ErrorSchema = z
  .object({
    code: z.string(),
    details: z.object({}).passthrough().optional(),
    message: z.string(),
    requestId: z.string(),
    retryable: z.boolean().optional(),
  })
  .strict();
export const BillingOperationSchema = z
  .object({
    attemptId: z
      .string()
      .refine((value2) => [...value2].length >= 1)
      .refine((value2) => [...value2].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?!\.{1,2}(?![\s\S]))[^\u0000\uD800-\uDFFF]+$/u
      ),
    canonicalToolKey: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 512)
      .optional(),
    capturedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u)
      .optional(),
    holdId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .optional(),
    modelId: z
      .union([
        z.string().refine((value2) => [...value2].length <= 256),
        z.null(),
      ])
      .optional(),
    operationId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
    outcome: z.union([z.string(), z.null()]).optional(),
    policyRevision: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .optional(),
    priceVersion: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
    receiptId: z
      .union([
        z.string().refine((value2) => [...value2].length <= 128),
        z.null(),
      ])
      .optional(),
    releasedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u)
      .optional(),
    reservedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    sessionGroupId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256)
      .optional(),
    state: z.union([
      z.literal("reserved"),
      z.literal("dispatched"),
      z.literal("settled"),
      z.literal("released"),
      z.literal("reconcile_pending"),
      z.literal("overage_pending"),
    ]),
    stepIndex: z.number().refine(Number.isInteger).min(0).optional(),
    subjectType: z.union([z.literal("model"), z.literal("tool")]).optional(),
    usage: z
      .union([
        z
          .object({
            inputTokens: z.number().refine(Number.isInteger).min(0).optional(),
            outputTokens: z.number().refine(Number.isInteger).min(0).optional(),
          })
          .strict(),
        z.null(),
      ])
      .optional(),
  })
  .strict();
export const NormalizedPaymentEventSchema = z
  .object({
    amountCents: z
      .number()
      .refine(Number.isInteger)
      .min(0)
      .max(9_007_199_254_740_991)
      .optional(),
    checkoutId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/u)
      .optional(),
    eventId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      ),
    eventType: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      ),
    expiresAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true })
      .optional(),
    occurredAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true })
      .optional(),
    organizationId: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(9_007_199_254_740_991)
      .optional(),
    points: z
      .string()
      .regex(
        /^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$|^-(?:0\.[0-9]{1,6}|[1-9][0-9]{0,18}(?:\.[0-9]{1,6})?)$/u
      )
      .optional(),
    provider: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      ),
    providerAccount: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    providerPaymentId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    refund: z
      .object({
        amountMinor: z
          .number()
          .refine(Number.isInteger)
          .min(1)
          .max(9_007_199_254_740_991),
        chargeId: z
          .string()
          .refine((value2) => [...value2].length >= 1)
          .refine((value2) => [...value2].length <= 256)
          .regex(
            // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
            /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
          ),
        state: z.intersection(
          z.string(),
          z.union([
            z.literal("pending"),
            z.literal("requires_action"),
            z.literal("succeeded"),
            z.literal("failed"),
            z.literal("canceled"),
          ])
        ),
      })
      .strict()
      .optional(),
    refundId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    signature: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 2048)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    subscription: z
      .object({
        cancelAtPeriodEnd: z.boolean().optional(),
        currentPeriodEnd: z
          .union([
            z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            z.null(),
          ])
          .optional(),
        currentPeriodStart: z
          .union([
            z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            z.null(),
          ])
          .optional(),
        metadata: z.object({}).passthrough().optional(),
        planSlug: z
          .string()
          .refine((value3) => [...value3].length >= 1)
          .refine((value3) => [...value3].length <= 128)
          .regex(
            // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
            /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
          ),
        status: z.intersection(
          z.string(),
          z.union([
            z.literal("trialing"),
            z.literal("active"),
            z.literal("past_due"),
            z.literal("canceled"),
            z.literal("incomplete"),
          ])
        ),
        subscriptionId: z
          .string()
          .refine((value3) => [...value3].length >= 1)
          .refine((value3) => [...value3].length <= 128)
          .regex(
            // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
            /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
          ),
      })
      .strict()
      .optional(),
    userId: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(9_007_199_254_740_991)
      .optional(),
  })
  .strict();
export const ExecutionPermitSchema = z
  .object({
    attemptId: z
      .string()
      .refine((value2) => [...value2].length >= 1)
      .refine((value2) => [...value2].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?!\.{1,2}(?![\s\S]))[^\u0000\uD800-\uDFFF]+$/u
      ),
    canonicalToolKey: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 512),
    chargeMode: z.union([z.literal("attempt"), z.literal("success")]),
    deploymentId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
    expiresAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    issuedAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    keyId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
    operationId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
    platformId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
    priceVersion: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
    protocolVersion: z.literal("v1"),
    reservedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    signature: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 2048),
  })
  .strict();
export const PlanSummarySchema = z
  .object({
    monthlyPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    name: z.string(),
    slug: z.string(),
  })
  .strict();
export const PlatformPlanSchema = z
  .object({
    active: z.boolean(),
    currency: z.string(),
    monthlyPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    name: z.string(),
    priceCents: z
      .number()
      .refine(Number.isInteger)
      .min(0)
      .max(9_007_199_254_740_991),
    priceVersion: z.union([z.string(), z.null()]),
    slug: z.string(),
  })
  .strict();
export const PlansResponseSchema = z
  .object({
    balancePoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    currency: z.literal("USD"),
    organizationId: z.union([
      z.number().refine(Number.isInteger).min(1),
      z.null(),
    ]),
    plans: z
      .array(
        z
          .object({
            active: z.boolean(),
            currency: z.string(),
            monthlyPoints: z
              .string()
              .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            name: z.string(),
            priceCents: z
              .number()
              .refine(Number.isInteger)
              .min(0)
              .max(9_007_199_254_740_991),
            priceVersion: z.union([z.string(), z.null()]),
            slug: z.string(),
          })
          .strict()
      )
      .max(100),
    requestId: z.string(),
    restrictedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    spendablePoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
  })
  .strict();
export const SubscriptionSchema = z
  .object({
    cancelAtPeriodEnd: z.boolean(),
    currentPeriodEnd: z.union([
      z
        .string()
        .regex(
          /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
        )
        .datetime({ offset: true }),
      z.null(),
    ]),
    currentPeriodStart: z.union([
      z
        .string()
        .regex(
          /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
        )
        .datetime({ offset: true }),
      z.null(),
    ]),
    plan: z.union([
      z
        .object({
          monthlyPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          name: z.string(),
          slug: z.string(),
        })
        .strict(),
      z.null(),
    ]),
    provider: z.string(),
    status: z.intersection(
      z.string(),
      z.union([
        z.literal("trialing"),
        z.literal("active"),
        z.literal("past_due"),
        z.literal("canceled"),
        z.literal("incomplete"),
      ])
    ),
    subscriptionId: z.string(),
  })
  .strict();
export const SubscriptionsResponseSchema = z
  .object({
    organizationId: z.union([
      z.number().refine(Number.isInteger).min(1),
      z.null(),
    ]),
    requestId: z.string(),
    subscriptions: z
      .array(
        z
          .object({
            cancelAtPeriodEnd: z.boolean(),
            currentPeriodEnd: z.union([
              z
                .string()
                .regex(
                  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                )
                .datetime({ offset: true }),
              z.null(),
            ]),
            currentPeriodStart: z.union([
              z
                .string()
                .regex(
                  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                )
                .datetime({ offset: true }),
              z.null(),
            ]),
            plan: z.union([
              z
                .object({
                  monthlyPoints: z
                    .string()
                    .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                  name: z.string(),
                  slug: z.string(),
                })
                .strict(),
              z.null(),
            ]),
            provider: z.string(),
            status: z.intersection(
              z.string(),
              z.union([
                z.literal("trialing"),
                z.literal("active"),
                z.literal("past_due"),
                z.literal("canceled"),
                z.literal("incomplete"),
              ])
            ),
            subscriptionId: z.string(),
          })
          .strict()
      )
      .max(100),
  })
  .strict();
export const CheckoutIntentRequestSchema = z
  .object({
    idempotencyKey: z
      .string()
      .refine((value2) => [...value2].length >= 1)
      .refine((value2) => [...value2].length <= 128)
      .regex(/^[\x21-\x7e]+$/u)
      .optional(),
    organizationId: z
      .union([
        z.string().regex(/^(?:|[1-9][0-9]{0,15})$/u),
        z.number().refine(Number.isInteger).min(1).max(9_007_199_254_740_991),
        z.null(),
      ])
      .refine(
        (value2) =>
          [
            z.string().regex(/^(?:|[1-9][0-9]{0,15})$/u),
            z
              .number()
              .refine(Number.isInteger)
              .min(1)
              .max(9_007_199_254_740_991),
            z.null(),
          ].filter((validator) => validator.safeParse(value2).success)
            .length === 1
      )
      .optional(),
    planSlug: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
  })
  .strict();
export const CheckoutIntentResponseSchema = z
  .object({
    checkoutId: z.string(),
    checkoutUrl: z.string().regex(/^https?:\x2f\x2f[^\s]+$/u),
    organizationId: z.union([
      z.number().refine(Number.isInteger).min(1),
      z.null(),
    ]),
    plan: z
      .object({
        active: z.boolean(),
        currency: z.string(),
        monthlyPoints: z
          .string()
          .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
        name: z.string(),
        priceCents: z
          .number()
          .refine(Number.isInteger)
          .min(0)
          .max(9_007_199_254_740_991),
        priceVersion: z.union([z.string(), z.null()]),
        slug: z.string(),
      })
      .strict(),
    requestId: z.string(),
  })
  .strict();
export const OrganizationSchema = z
  .object({
    balancePoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    id: z.number().refine(Number.isInteger).min(1),
    name: z.string(),
    role: z.intersection(
      z.string(),
      z.union([z.literal("owner"), z.literal("admin"), z.literal("member")])
    ),
    slug: z.string(),
    status: z.literal("active"),
  })
  .strict();
export const OrganizationsResponseSchema = z
  .object({
    organizations: z
      .array(
        z
          .object({
            balancePoints: z
              .string()
              .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            id: z.number().refine(Number.isInteger).min(1),
            name: z.string(),
            role: z.intersection(
              z.string(),
              z.union([
                z.literal("owner"),
                z.literal("admin"),
                z.literal("member"),
              ])
            ),
            slug: z.string(),
            status: z.literal("active"),
          })
          .strict()
      )
      .max(1000),
    requestId: z.string(),
  })
  .strict();
export const CreateOrganizationRequestSchema = z
  .object({
    name: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 120),
    slug: z
      .string()
      .refine((value1) => [...value1].length <= 120)
      .optional(),
  })
  .strict();
export const CreateOrganizationResponseSchema = z
  .object({
    organization: z
      .object({
        balancePoints: z
          .string()
          .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
        id: z.number().refine(Number.isInteger).min(1),
        name: z.string(),
        role: z.intersection(
          z.string(),
          z.union([z.literal("owner"), z.literal("admin"), z.literal("member")])
        ),
        slug: z.string(),
        status: z.literal("active"),
      })
      .strict(),
    requestId: z.string(),
  })
  .strict();
export const OrganizationMemberSchema = z
  .object({
    active: z.boolean(),
    email: z.union([z.string(), z.null()]),
    name: z.union([z.string(), z.null()]),
    role: z.intersection(
      z.string(),
      z.union([z.literal("owner"), z.literal("admin"), z.literal("member")])
    ),
    userId: z.number().refine(Number.isInteger).min(1),
  })
  .strict();
export const OrganizationMembersResponseSchema = z
  .object({
    members: z
      .array(
        z
          .object({
            active: z.boolean(),
            email: z.union([z.string(), z.null()]),
            name: z.union([z.string(), z.null()]),
            role: z.intersection(
              z.string(),
              z.union([
                z.literal("owner"),
                z.literal("admin"),
                z.literal("member"),
              ])
            ),
            userId: z.number().refine(Number.isInteger).min(1),
          })
          .strict()
      )
      .max(1000),
    requestId: z.string(),
  })
  .strict();
export const AddOrganizationMemberRequestSchema = z
  .object({
    userId: z.union([
      z
        .string()
        .refine((value2) => [...value2].length <= 16)
        .regex(/^[1-9][0-9]*$/u),
      z.number().refine(Number.isInteger).min(1).max(9_007_199_254_740_991),
    ]),
  })
  .strict();
export const AddOrganizationMemberResponseSchema = z
  .object({
    member: z
      .object({
        active: z.literal(true),
        role: z.literal("member"),
        userId: z.number().refine(Number.isInteger).min(1),
      })
      .strict(),
    requestId: z.string(),
  })
  .strict();
export const SessionSummarySchema = z
  .object({
    capturedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u),
    chatId: z.string(),
    createdAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    organizationId: z.union([
      z.number().refine(Number.isInteger).min(1),
      z.null(),
    ]),
    reservedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u),
    runId: z.union([z.string(), z.null()]),
    sessionGroupId: z.string(),
    status: z.intersection(
      z.string(),
      z.union([
        z.literal("active"),
        z.literal("completed"),
        z.literal("reconcile_pending"),
        z.literal("overage_pending"),
      ])
    ),
    stepsCount: z.number().refine(Number.isInteger).min(0),
  })
  .strict();
export const SessionsResponseSchema = z
  .object({
    balancePoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    requestId: z.string(),
    sessions: z
      .array(
        z
          .object({
            capturedPoints: z
              .string()
              .regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u),
            chatId: z.string(),
            createdAt: z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            organizationId: z.union([
              z.number().refine(Number.isInteger).min(1),
              z.null(),
            ]),
            reservedPoints: z
              .string()
              .regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u),
            runId: z.union([z.string(), z.null()]),
            sessionGroupId: z.string(),
            status: z.intersection(
              z.string(),
              z.union([
                z.literal("active"),
                z.literal("completed"),
                z.literal("reconcile_pending"),
                z.literal("overage_pending"),
              ])
            ),
            stepsCount: z.number().refine(Number.isInteger).min(0),
          })
          .strict()
      )
      .max(100),
  })
  .strict();
export const PublicExecutionReceiptSchema = z
  .object({
    dispatchEvidence: z.union([z.string(), z.null()]),
    httpStatus: z.union([z.number().refine(Number.isInteger), z.null()]),
    outcome: z.union([z.string(), z.null()]),
    receiptId: z.union([z.string(), z.null()]),
    receiptRevision: z.union([z.number().refine(Number.isInteger), z.null()]),
    supplierUnits: z
      .record(
        z.string().refine((value2) => [...value2].length <= 64),
        z.string().refine((value2) => [...value2].length <= 128)
      )
      .optional(),
  })
  .strict();
export const SessionStepSchema = z
  .object({
    attemptId: z
      .string()
      .refine((value2) => [...value2].length >= 1)
      .refine((value2) => [...value2].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?!\.{1,2}(?![\s\S]))[^\u0000\uD800-\uDFFF]+$/u
      ),
    canonicalToolKey: z.string(),
    capturedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    createdAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    executionReceipt: z.union([
      z
        .object({
          dispatchEvidence: z.union([z.string(), z.null()]),
          httpStatus: z.union([z.number().refine(Number.isInteger), z.null()]),
          outcome: z.union([z.string(), z.null()]),
          receiptId: z.union([z.string(), z.null()]),
          receiptRevision: z.union([
            z.number().refine(Number.isInteger),
            z.null(),
          ]),
          supplierUnits: z
            .record(
              z.string().refine((value5) => [...value5].length <= 64),
              z.string().refine((value5) => [...value5].length <= 128)
            )
            .optional(),
        })
        .strict(),
      z.null(),
    ]),
    modelId: z.union([z.string(), z.null()]),
    operationId: z.string(),
    outcome: z.union([z.string(), z.null()]),
    reservedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    state: z.intersection(
      z.string(),
      z.union([
        z.literal("reserved"),
        z.literal("dispatched"),
        z.literal("settled"),
        z.literal("released"),
        z.literal("reconcile_pending"),
        z.literal("overage_pending"),
      ])
    ),
    stepIndex: z.union([z.number().refine(Number.isInteger), z.null()]),
    subjectType: z.intersection(
      z.string(),
      z.union([z.literal("model"), z.literal("tool")])
    ),
    updatedAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    usage: z.union([
      z
        .object({
          inputTokens: z.number().refine(Number.isInteger).min(0),
          outputTokens: z.number().refine(Number.isInteger).min(0),
        })
        .strict(),
      z.null(),
    ]),
  })
  .strict();
export const SessionDetailsResponseSchema = z
  .object({
    page: z
      .object({
        hasMore: z.boolean(),
        limit: z.number().refine(Number.isInteger).min(1).max(1000),
        nextCursor: z.union([
          z.string().refine((value4) => [...value4].length <= 512),
          z.null(),
        ]),
        totalSteps: z
          .number()
          .refine(Number.isInteger)
          .min(0)
          .max(9_007_199_254_740_991),
      })
      .strict(),
    requestId: z.string(),
    session: z
      .object({
        chatId: z.string(),
        organizationId: z.union([
          z.number().refine(Number.isInteger).min(1),
          z.null(),
        ]),
        runId: z.union([z.string(), z.null()]),
        sessionGroupId: z.string(),
        status: z.intersection(
          z.string(),
          z.union([
            z.literal("active"),
            z.literal("completed"),
            z.literal("reconcile_pending"),
            z.literal("overage_pending"),
          ])
        ),
      })
      .strict(),
    steps: z
      .array(
        z
          .object({
            attemptId: z
              .string()
              .refine((value5) => [...value5].length >= 1)
              .refine((value5) => [...value5].length <= 128)
              .regex(
                // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                /^(?!\.{1,2}(?![\s\S]))[^\u0000\uD800-\uDFFF]+$/u
              ),
            canonicalToolKey: z.string(),
            capturedPoints: z
              .string()
              .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            createdAt: z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            executionReceipt: z.union([
              z
                .object({
                  dispatchEvidence: z.union([z.string(), z.null()]),
                  httpStatus: z.union([
                    z.number().refine(Number.isInteger),
                    z.null(),
                  ]),
                  outcome: z.union([z.string(), z.null()]),
                  receiptId: z.union([z.string(), z.null()]),
                  receiptRevision: z.union([
                    z.number().refine(Number.isInteger),
                    z.null(),
                  ]),
                  supplierUnits: z
                    .record(
                      z.string().refine((value8) => [...value8].length <= 64),
                      z.string().refine((value8) => [...value8].length <= 128)
                    )
                    .optional(),
                })
                .strict(),
              z.null(),
            ]),
            modelId: z.union([z.string(), z.null()]),
            operationId: z.string(),
            outcome: z.union([z.string(), z.null()]),
            reservedPoints: z
              .string()
              .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            state: z.intersection(
              z.string(),
              z.union([
                z.literal("reserved"),
                z.literal("dispatched"),
                z.literal("settled"),
                z.literal("released"),
                z.literal("reconcile_pending"),
                z.literal("overage_pending"),
              ])
            ),
            stepIndex: z.union([z.number().refine(Number.isInteger), z.null()]),
            subjectType: z.intersection(
              z.string(),
              z.union([z.literal("model"), z.literal("tool")])
            ),
            updatedAt: z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            usage: z.union([
              z
                .object({
                  inputTokens: z.number().refine(Number.isInteger).min(0),
                  outputTokens: z.number().refine(Number.isInteger).min(0),
                })
                .strict(),
              z.null(),
            ]),
          })
          .strict()
      )
      .max(1000),
    totals: z
      .object({
        capturedPoints: z
          .string()
          .regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u),
        reservedPoints: z
          .string()
          .regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u),
      })
      .strict(),
  })
  .strict();
export const ExpireWalletGrantsResponseSchema = z
  .object({
    expired: z.number().refine(Number.isInteger).min(0).max(1000),
    requestId: z.string(),
  })
  .strict();
export const IdentityExchangeResponseSchema = z
  .object({
    audience: z.literal("platform-billing"),
    expiresAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    issuer: z.string(),
    requestId: z.string(),
    scope: z.array(z.literal("platform:billing")).min(1).max(1),
    subject: z.string(),
    token: z.string().refine((value1) => [...value1].length >= 1),
  })
  .strict();
export const IdentityDeactivateRequestSchema = z
  .object({
    issuer: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256),
    subject: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256),
  })
  .strict();
export const IdentityDeactivateResponseSchema = z
  .object({ deactivated: z.boolean(), requestId: z.string() })
  .strict();
export const AdminCapabilityResponseSchema = z
  .object({
    adminId: z.number().refine(Number.isInteger).min(1),
    allowed: z.literal(true),
    requestId: z.string(),
    role: z.intersection(
      z.string(),
      z.union([z.literal("admin"), z.literal("operator")])
    ),
  })
  .strict();
export const AuditProjectionSchema = z
  .object({
    action: z.string(),
    actorId: z.union([z.number().refine(Number.isInteger).min(1), z.null()]),
    actorIssuer: z.union([z.string(), z.null()]),
    actorSubject: z.union([z.string(), z.null()]),
    afterState: z.union([z.object({}).passthrough(), z.null()]),
    beforeState: z.union([z.object({}).passthrough(), z.null()]),
    correlationId: z.string(),
    createdAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    id: z.number().refine(Number.isInteger).min(1),
    ipAddress: z.union([z.string(), z.null()]),
    requestId: z.string(),
    resourceId: z.union([z.string(), z.null()]),
    resourceType: z.string(),
    result: z.string(),
    summary: z.union([z.object({}).passthrough(), z.null()]),
    updatedAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    userAgent: z.union([z.string(), z.null()]),
  })
  .strict();
export const AuditListResponseSchema = z
  .object({
    audits: z
      .array(
        z
          .object({
            action: z.string(),
            actorId: z.union([
              z.number().refine(Number.isInteger).min(1),
              z.null(),
            ]),
            actorIssuer: z.union([z.string(), z.null()]),
            actorSubject: z.union([z.string(), z.null()]),
            afterState: z.union([z.object({}).passthrough(), z.null()]),
            beforeState: z.union([z.object({}).passthrough(), z.null()]),
            correlationId: z.string(),
            createdAt: z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            id: z.number().refine(Number.isInteger).min(1),
            ipAddress: z.union([z.string(), z.null()]),
            requestId: z.string(),
            resourceId: z.union([z.string(), z.null()]),
            resourceType: z.string(),
            result: z.string(),
            summary: z.union([z.object({}).passthrough(), z.null()]),
            updatedAt: z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            userAgent: z.union([z.string(), z.null()]),
          })
          .strict()
      )
      .max(100),
    hasMore: z.boolean(),
    nextCursor: z.union([z.string(), z.null()]),
    requestId: z.string(),
    viewerAdminId: z.number().refine(Number.isInteger).min(1),
  })
  .strict();
export const AuditExportRequestSchema = z
  .object({
    count: z.number().refine(Number.isInteger).min(0).max(1000).optional(),
    scope: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 64)
      .optional(),
  })
  .strict();
export const AuditExportResponseSchema = z
  .object({
    count: z.number().refine(Number.isInteger).min(0).max(1000),
    recorded: z.literal(true),
    requestId: z.string(),
  })
  .strict();
export const BillingApprovalSchema = z
  .object({
    action: z.intersection(
      z.string(),
      z.union([
        z.literal("reconcile"),
        z.literal("wallet_adjust"),
        z.literal("refund_recovery"),
        z.literal("dispute_review"),
      ])
    ),
    approvalId: z.string(),
    approvedAt: z.union([
      z
        .string()
        .regex(
          /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
        )
        .datetime({ offset: true }),
      z.null(),
    ]),
    approvedBy: z.union([z.number().refine(Number.isInteger).min(1), z.null()]),
    consumedAt: z.union([
      z
        .string()
        .regex(
          /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
        )
        .datetime({ offset: true }),
      z.null(),
    ]),
    decision: z.union([z.string(), z.null()]),
    deltaPoints: z.union([
      z.string().regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
      z.null(),
    ]),
    disputeReviewSnapshot: z.union([
      z
        .object({
          caseCount: z.number().refine(Number.isInteger).min(1).max(1000),
          checkoutId: z
            .string()
            .refine((value4) => [...value4].length >= 1)
            .refine((value4) => [...value4].length <= 256),
          checkoutIntentId: z
            .number()
            .refine(Number.isInteger)
            .min(1)
            .max(2_147_483_647),
          coverageHash: z.string().regex(/^[a-f0-9]{64}$/u),
          disputeTargetPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          evidenceReference: z
            .string()
            .refine((value4) => [...value4].length >= 3)
            .refine((value4) => [...value4].length <= 200)
            .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,199}$/u),
          expiresAt: z.union([
            z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            z.null(),
          ]),
          grantId: z
            .number()
            .refine(Number.isInteger)
            .min(1)
            .max(2_147_483_647),
          grantVersion: z
            .number()
            .refine(Number.isInteger)
            .min(1)
            .max(9_007_199_254_740_991),
          organizationId: z.union([
            z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
            z.null(),
          ]),
          refundTargetPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          sourcePaymentEventId: z
            .number()
            .refine(Number.isInteger)
            .min(1)
            .max(2_147_483_647),
          spendablePoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
        })
        .strict(),
      z.null(),
    ]),
    expiresAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    mutationHash: z.union([z.string(), z.null()]),
    organizationId: z.union([
      z.number().refine(Number.isInteger).min(1).max(9_007_199_254_740_991),
      z.null(),
    ]),
    reason: z.string(),
    recoverySnapshot: z.union([
      z
        .object({
          accountId: z
            .number()
            .refine(Number.isInteger)
            .min(1)
            .max(2_147_483_647),
          amountMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,15})$/u),
          availablePoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          capturedMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,15})$/u),
          chargeId: z
            .string()
            .refine((value4) => [...value4].length >= 1)
            .refine((value4) => [...value4].length <= 256),
          checkoutId: z
            .string()
            .refine((value4) => [...value4].length >= 1)
            .refine((value4) => [...value4].length <= 256),
          checkoutIntentId: z
            .number()
            .refine(Number.isInteger)
            .min(1)
            .max(2_147_483_647),
          checkoutRevision: z
            .string()
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
          coveredEvents: z
            .array(
              z
                .object({
                  id: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(2_147_483_647),
                  payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
                })
                .strict()
            )
            .min(1)
            .max(200),
          currency: z.string().regex(/^[A-Z]{3}$/u),
          customerResolutionReference: z
            .string()
            .refine((value4) => [...value4].length >= 3)
            .refine((value4) => [...value4].length <= 200),
          disposition: z.literal("customer_elected_original_entitlement"),
          evidenceRetrievedAt: z
            .string()
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
          expiredAvailablePoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          expiredPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          factSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
          failureBalanceTransactionId: z
            .string()
            .refine((value4) => [...value4].length >= 1)
            .refine((value4) => [...value4].length <= 256),
          failureReason: z.string().regex(/^[a-z_]{1,128}$/u),
          grantId: z
            .number()
            .refine(Number.isInteger)
            .min(1)
            .max(2_147_483_647),
          grantVersion: z
            .number()
            .refine(Number.isInteger)
            .min(1)
            .max(9_007_199_254_740_991),
          grossRefundMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,63})$/u),
          livemode: z.boolean(),
          lossPosition: z.union([
            z
              .object({
                disputeFundedAfterPoints: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                disputeGapAfterPoints: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                disputeTargetAfterPoints: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                disputeTargetBeforePoints: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                movements: z
                  .array(
                    z
                      .object({
                        from: z.union([
                          z.literal("available"),
                          z.literal("refunded"),
                          z.literal("disputed"),
                          z.literal("expired"),
                        ]),
                        points: z
                          .string()
                          .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                        to: z.union([
                          z.literal("available"),
                          z.literal("refunded"),
                          z.literal("disputed"),
                          z.literal("expired"),
                        ]),
                      })
                      .strict()
                  )
                  .max(8),
                refundFundedAfterPoints: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                refundGapAfterPoints: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                reviewRequired: z.boolean(),
                transferredToDisputePoints: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              })
              .strict(),
            z.null(),
          ]),
          organizationId: z.union([
            z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
            z.null(),
          ]),
          originalBalanceTransactionId: z
            .string()
            .refine((value4) => [...value4].length >= 1)
            .refine((value4) => [...value4].length <= 256),
          originalExpiresAt: z.union([
            z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            z.null(),
          ]),
          paymentEventId: z
            .number()
            .refine(Number.isInteger)
            .min(1)
            .max(2_147_483_647),
          priorRecoveryMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,63})$/u),
          providerAccount: z.union([
            z
              .string()
              .refine((value5) => [...value5].length >= 1)
              .refine((value5) => [...value5].length <= 256),
            z.null(),
          ]),
          providerEvidenceHash: z.string().regex(/^[a-f0-9]{64}$/u),
          providerPaymentId: z
            .string()
            .refine((value4) => [...value4].length >= 1)
            .refine((value4) => [...value4].length <= 256),
          providerRequestId: z.union([
            z
              .string()
              .refine((value5) => [...value5].length >= 1)
              .refine((value5) => [...value5].length <= 256),
            z.null(),
          ]),
          providerState: z.intersection(
            z.string(),
            z.union([z.literal("failed"), z.literal("canceled")])
          ),
          recoveredPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          refundEventId: z
            .number()
            .refine(Number.isInteger)
            .min(1)
            .max(2_147_483_647),
          refundId: z
            .string()
            .refine((value4) => [...value4].length >= 1)
            .refine((value4) => [...value4].length <= 256),
          targetAfterPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          targetBeforePoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          userId: z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
          walletDeltaPoints: z
            .string()
            .regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          walletVersion: z
            .number()
            .refine(Number.isInteger)
            .min(1)
            .max(9_007_199_254_740_991),
        })
        .strict(),
      z.null(),
    ]),
    requestedBy: z.number().refine(Number.isInteger).min(1),
    requestedRevision: z.string(),
    resourceId: z.string(),
    status: z.intersection(
      z.string(),
      z.union([
        z.literal("pending"),
        z.literal("approved"),
        z.literal("consumed"),
        z.literal("rejected"),
        z.literal("expired"),
      ])
    ),
  })
  .strict();
export const ApprovalListResponseSchema = z
  .object({
    approvals: z
      .array(
        z
          .object({
            action: z.intersection(
              z.string(),
              z.union([
                z.literal("reconcile"),
                z.literal("wallet_adjust"),
                z.literal("refund_recovery"),
                z.literal("dispute_review"),
              ])
            ),
            approvalId: z.string(),
            approvedAt: z.union([
              z
                .string()
                .regex(
                  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                )
                .datetime({ offset: true }),
              z.null(),
            ]),
            approvedBy: z.union([
              z.number().refine(Number.isInteger).min(1),
              z.null(),
            ]),
            consumedAt: z.union([
              z
                .string()
                .regex(
                  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                )
                .datetime({ offset: true }),
              z.null(),
            ]),
            decision: z.union([z.string(), z.null()]),
            deltaPoints: z.union([
              z.string().regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              z.null(),
            ]),
            disputeReviewSnapshot: z.union([
              z
                .object({
                  caseCount: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(1000),
                  checkoutId: z
                    .string()
                    .refine((value7) => [...value7].length >= 1)
                    .refine((value7) => [...value7].length <= 256),
                  checkoutIntentId: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(2_147_483_647),
                  coverageHash: z.string().regex(/^[a-f0-9]{64}$/u),
                  disputeTargetPoints: z
                    .string()
                    .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                  evidenceReference: z
                    .string()
                    .refine((value7) => [...value7].length >= 3)
                    .refine((value7) => [...value7].length <= 200)
                    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,199}$/u),
                  expiresAt: z.union([
                    z
                      .string()
                      .regex(
                        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                      )
                      .datetime({ offset: true }),
                    z.null(),
                  ]),
                  grantId: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(2_147_483_647),
                  grantVersion: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(9_007_199_254_740_991),
                  organizationId: z.union([
                    z
                      .number()
                      .refine(Number.isInteger)
                      .min(1)
                      .max(2_147_483_647),
                    z.null(),
                  ]),
                  refundTargetPoints: z
                    .string()
                    .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                  sourcePaymentEventId: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(2_147_483_647),
                  spendablePoints: z
                    .string()
                    .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                })
                .strict(),
              z.null(),
            ]),
            expiresAt: z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            mutationHash: z.union([z.string(), z.null()]),
            organizationId: z.union([
              z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(9_007_199_254_740_991),
              z.null(),
            ]),
            reason: z.string(),
            recoverySnapshot: z.union([
              z
                .object({
                  accountId: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(2_147_483_647),
                  amountMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,15})$/u),
                  availablePoints: z
                    .string()
                    .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                  capturedMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,15})$/u),
                  chargeId: z
                    .string()
                    .refine((value7) => [...value7].length >= 1)
                    .refine((value7) => [...value7].length <= 256),
                  checkoutId: z
                    .string()
                    .refine((value7) => [...value7].length >= 1)
                    .refine((value7) => [...value7].length <= 256),
                  checkoutIntentId: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(2_147_483_647),
                  checkoutRevision: z
                    .string()
                    .regex(
                      /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                    )
                    .datetime({ offset: true }),
                  coveredEvents: z
                    .array(
                      z
                        .object({
                          id: z
                            .number()
                            .refine(Number.isInteger)
                            .min(1)
                            .max(2_147_483_647),
                          payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
                        })
                        .strict()
                    )
                    .min(1)
                    .max(200),
                  currency: z.string().regex(/^[A-Z]{3}$/u),
                  customerResolutionReference: z
                    .string()
                    .refine((value7) => [...value7].length >= 3)
                    .refine((value7) => [...value7].length <= 200),
                  disposition: z.literal(
                    "customer_elected_original_entitlement"
                  ),
                  evidenceRetrievedAt: z
                    .string()
                    .regex(
                      /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                    )
                    .datetime({ offset: true }),
                  expiredAvailablePoints: z
                    .string()
                    .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                  expiredPoints: z
                    .string()
                    .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                  factSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
                  failureBalanceTransactionId: z
                    .string()
                    .refine((value7) => [...value7].length >= 1)
                    .refine((value7) => [...value7].length <= 256),
                  failureReason: z.string().regex(/^[a-z_]{1,128}$/u),
                  grantId: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(2_147_483_647),
                  grantVersion: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(9_007_199_254_740_991),
                  grossRefundMinor: z
                    .string()
                    .regex(/^(?:0|[1-9][0-9]{0,63})$/u),
                  livemode: z.boolean(),
                  lossPosition: z.union([
                    z
                      .object({
                        disputeFundedAfterPoints: z
                          .string()
                          .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                        disputeGapAfterPoints: z
                          .string()
                          .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                        disputeTargetAfterPoints: z
                          .string()
                          .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                        disputeTargetBeforePoints: z
                          .string()
                          .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                        movements: z
                          .array(
                            z
                              .object({
                                from: z.union([
                                  z.literal("available"),
                                  z.literal("refunded"),
                                  z.literal("disputed"),
                                  z.literal("expired"),
                                ]),
                                points: z
                                  .string()
                                  .regex(
                                    /^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u
                                  ),
                                to: z.union([
                                  z.literal("available"),
                                  z.literal("refunded"),
                                  z.literal("disputed"),
                                  z.literal("expired"),
                                ]),
                              })
                              .strict()
                          )
                          .max(8),
                        refundFundedAfterPoints: z
                          .string()
                          .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                        refundGapAfterPoints: z
                          .string()
                          .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                        reviewRequired: z.boolean(),
                        transferredToDisputePoints: z
                          .string()
                          .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                      })
                      .strict(),
                    z.null(),
                  ]),
                  organizationId: z.union([
                    z
                      .number()
                      .refine(Number.isInteger)
                      .min(1)
                      .max(2_147_483_647),
                    z.null(),
                  ]),
                  originalBalanceTransactionId: z
                    .string()
                    .refine((value7) => [...value7].length >= 1)
                    .refine((value7) => [...value7].length <= 256),
                  originalExpiresAt: z.union([
                    z
                      .string()
                      .regex(
                        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                      )
                      .datetime({ offset: true }),
                    z.null(),
                  ]),
                  paymentEventId: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(2_147_483_647),
                  priorRecoveryMinor: z
                    .string()
                    .regex(/^(?:0|[1-9][0-9]{0,63})$/u),
                  providerAccount: z.union([
                    z
                      .string()
                      .refine((value8) => [...value8].length >= 1)
                      .refine((value8) => [...value8].length <= 256),
                    z.null(),
                  ]),
                  providerEvidenceHash: z.string().regex(/^[a-f0-9]{64}$/u),
                  providerPaymentId: z
                    .string()
                    .refine((value7) => [...value7].length >= 1)
                    .refine((value7) => [...value7].length <= 256),
                  providerRequestId: z.union([
                    z
                      .string()
                      .refine((value8) => [...value8].length >= 1)
                      .refine((value8) => [...value8].length <= 256),
                    z.null(),
                  ]),
                  providerState: z.intersection(
                    z.string(),
                    z.union([z.literal("failed"), z.literal("canceled")])
                  ),
                  recoveredPoints: z
                    .string()
                    .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                  refundEventId: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(2_147_483_647),
                  refundId: z
                    .string()
                    .refine((value7) => [...value7].length >= 1)
                    .refine((value7) => [...value7].length <= 256),
                  targetAfterPoints: z
                    .string()
                    .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                  targetBeforePoints: z
                    .string()
                    .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                  userId: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(2_147_483_647),
                  walletDeltaPoints: z
                    .string()
                    .regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                  walletVersion: z
                    .number()
                    .refine(Number.isInteger)
                    .min(1)
                    .max(9_007_199_254_740_991),
                })
                .strict(),
              z.null(),
            ]),
            requestedBy: z.number().refine(Number.isInteger).min(1),
            requestedRevision: z.string(),
            resourceId: z.string(),
            status: z.intersection(
              z.string(),
              z.union([
                z.literal("pending"),
                z.literal("approved"),
                z.literal("consumed"),
                z.literal("rejected"),
                z.literal("expired"),
              ])
            ),
          })
          .strict()
      )
      .max(100),
    hasMore: z.boolean(),
    nextCursor: z.union([z.string(), z.null()]),
    requestId: z.string(),
    viewerAdminId: z.number().refine(Number.isInteger).min(1),
  })
  .strict();
export const ApprovalResponseSchema = z
  .object({
    approval: z
      .object({
        action: z.intersection(
          z.string(),
          z.union([
            z.literal("reconcile"),
            z.literal("wallet_adjust"),
            z.literal("refund_recovery"),
            z.literal("dispute_review"),
          ])
        ),
        approvalId: z.string(),
        approvedAt: z.union([
          z
            .string()
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
          z.null(),
        ]),
        approvedBy: z.union([
          z.number().refine(Number.isInteger).min(1),
          z.null(),
        ]),
        consumedAt: z.union([
          z
            .string()
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
          z.null(),
        ]),
        decision: z.union([z.string(), z.null()]),
        deltaPoints: z.union([
          z.string().regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          z.null(),
        ]),
        disputeReviewSnapshot: z.union([
          z
            .object({
              caseCount: z.number().refine(Number.isInteger).min(1).max(1000),
              checkoutId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              checkoutIntentId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              coverageHash: z.string().regex(/^[a-f0-9]{64}$/u),
              disputeTargetPoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              evidenceReference: z
                .string()
                .refine((value6) => [...value6].length >= 3)
                .refine((value6) => [...value6].length <= 200)
                .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,199}$/u),
              expiresAt: z.union([
                z
                  .string()
                  .regex(
                    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                  )
                  .datetime({ offset: true }),
                z.null(),
              ]),
              grantId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              grantVersion: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(9_007_199_254_740_991),
              organizationId: z.union([
                z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
                z.null(),
              ]),
              refundTargetPoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              sourcePaymentEventId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              spendablePoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            })
            .strict(),
          z.null(),
        ]),
        expiresAt: z
          .string()
          .regex(
            /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
          )
          .datetime({ offset: true }),
        mutationHash: z.union([z.string(), z.null()]),
        organizationId: z.union([
          z.number().refine(Number.isInteger).min(1).max(9_007_199_254_740_991),
          z.null(),
        ]),
        reason: z.string(),
        recoverySnapshot: z.union([
          z
            .object({
              accountId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              amountMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,15})$/u),
              availablePoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              capturedMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,15})$/u),
              chargeId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              checkoutId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              checkoutIntentId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              checkoutRevision: z
                .string()
                .regex(
                  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                )
                .datetime({ offset: true }),
              coveredEvents: z
                .array(
                  z
                    .object({
                      id: z
                        .number()
                        .refine(Number.isInteger)
                        .min(1)
                        .max(2_147_483_647),
                      payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
                    })
                    .strict()
                )
                .min(1)
                .max(200),
              currency: z.string().regex(/^[A-Z]{3}$/u),
              customerResolutionReference: z
                .string()
                .refine((value6) => [...value6].length >= 3)
                .refine((value6) => [...value6].length <= 200),
              disposition: z.literal("customer_elected_original_entitlement"),
              evidenceRetrievedAt: z
                .string()
                .regex(
                  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                )
                .datetime({ offset: true }),
              expiredAvailablePoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              expiredPoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              factSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
              failureBalanceTransactionId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              failureReason: z.string().regex(/^[a-z_]{1,128}$/u),
              grantId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              grantVersion: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(9_007_199_254_740_991),
              grossRefundMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,63})$/u),
              livemode: z.boolean(),
              lossPosition: z.union([
                z
                  .object({
                    disputeFundedAfterPoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    disputeGapAfterPoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    disputeTargetAfterPoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    disputeTargetBeforePoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    movements: z
                      .array(
                        z
                          .object({
                            from: z.union([
                              z.literal("available"),
                              z.literal("refunded"),
                              z.literal("disputed"),
                              z.literal("expired"),
                            ]),
                            points: z
                              .string()
                              .regex(
                                /^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u
                              ),
                            to: z.union([
                              z.literal("available"),
                              z.literal("refunded"),
                              z.literal("disputed"),
                              z.literal("expired"),
                            ]),
                          })
                          .strict()
                      )
                      .max(8),
                    refundFundedAfterPoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    refundGapAfterPoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    reviewRequired: z.boolean(),
                    transferredToDisputePoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                  })
                  .strict(),
                z.null(),
              ]),
              organizationId: z.union([
                z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
                z.null(),
              ]),
              originalBalanceTransactionId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              originalExpiresAt: z.union([
                z
                  .string()
                  .regex(
                    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                  )
                  .datetime({ offset: true }),
                z.null(),
              ]),
              paymentEventId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              priorRecoveryMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,63})$/u),
              providerAccount: z.union([
                z
                  .string()
                  .refine((value7) => [...value7].length >= 1)
                  .refine((value7) => [...value7].length <= 256),
                z.null(),
              ]),
              providerEvidenceHash: z.string().regex(/^[a-f0-9]{64}$/u),
              providerPaymentId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              providerRequestId: z.union([
                z
                  .string()
                  .refine((value7) => [...value7].length >= 1)
                  .refine((value7) => [...value7].length <= 256),
                z.null(),
              ]),
              providerState: z.intersection(
                z.string(),
                z.union([z.literal("failed"), z.literal("canceled")])
              ),
              recoveredPoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              refundEventId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              refundId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              targetAfterPoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              targetBeforePoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              userId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              walletDeltaPoints: z
                .string()
                .regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              walletVersion: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(9_007_199_254_740_991),
            })
            .strict(),
          z.null(),
        ]),
        requestedBy: z.number().refine(Number.isInteger).min(1),
        requestedRevision: z.string(),
        resourceId: z.string(),
        status: z.intersection(
          z.string(),
          z.union([
            z.literal("pending"),
            z.literal("approved"),
            z.literal("consumed"),
            z.literal("rejected"),
            z.literal("expired"),
          ])
        ),
      })
      .strict(),
    requestId: z.string(),
  })
  .strict();
export const ApprovalRequestSchema = z
  .union([
    z
      .object({
        action: z.literal("reconcile"),
        decision: z.intersection(
          z.string(),
          z.union([
            z.literal("capture_reserved"),
            z.literal("release_reserved"),
            z.literal("charge_overage"),
          ])
        ),
        reason: z.string(),
        resourceId: z
          .string()
          .refine((value2) => [...value2].length >= 1)
          .refine((value2) => [...value2].length <= 256),
        revision: z
          .string()
          .refine((value2) => [...value2].length >= 1)
          .refine((value2) => [...value2].length <= 256),
      })
      .strict(),
    z
      .object({
        action: z.literal("wallet_adjust"),
        deltaPoints: z
          .union([
            z.string().regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            z
              .number()
              .refine(Number.isInteger)
              .min(-9_007_199_254_740_991)
              .max(9_007_199_254_740_991),
          ])
          .refine(
            (value2) =>
              [
                z
                  .string()
                  .regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                z
                  .number()
                  .refine(Number.isInteger)
                  .min(-9_007_199_254_740_991)
                  .max(9_007_199_254_740_991),
              ].filter((validator) => validator.safeParse(value2).success)
                .length === 1
          ),
        organizationId: z
          .union([
            z.string().regex(/^[1-9][0-9]{0,15}$/u),
            z
              .number()
              .refine(Number.isInteger)
              .min(1)
              .max(9_007_199_254_740_991),
            z.null(),
          ])
          .refine(
            (value2) =>
              [
                z.string().regex(/^[1-9][0-9]{0,15}$/u),
                z
                  .number()
                  .refine(Number.isInteger)
                  .min(1)
                  .max(9_007_199_254_740_991),
                z.null(),
              ].filter((validator) => validator.safeParse(value2).success)
                .length === 1
          )
          .optional(),
        reason: z.string(),
        resourceId: z
          .string()
          .refine((value2) => [...value2].length >= 1)
          .refine((value2) => [...value2].length <= 256)
          .regex(/^[1-9][0-9]{0,15}$/u),
      })
      .strict(),
    z
      .object({
        action: z.literal("refund_recovery"),
        customerResolutionReference: z
          .string()
          .refine((value2) => [...value2].length >= 3)
          .refine((value2) => [...value2].length <= 200),
        disposition: z.literal("customer_elected_original_entitlement"),
        reason: z.string(),
        resourceId: z
          .string()
          .refine((value2) => [...value2].length <= 10)
          .regex(/^[1-9][0-9]{0,9}$/u),
      })
      .strict(),
    z
      .object({
        action: z.literal("dispute_review"),
        evidenceReference: z
          .string()
          .refine((value2) => [...value2].length >= 3)
          .refine((value2) => [...value2].length <= 200)
          .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,199}$/u),
        reason: z.string(),
        resourceId: z
          .string()
          .refine((value2) => [...value2].length <= 10)
          .regex(/^[1-9][0-9]{0,9}$/u),
      })
      .strict(),
  ])
  .refine(
    (value0) =>
      [
        z
          .object({
            action: z.literal("reconcile"),
            decision: z.intersection(
              z.string(),
              z.union([
                z.literal("capture_reserved"),
                z.literal("release_reserved"),
                z.literal("charge_overage"),
              ])
            ),
            reason: z.string(),
            resourceId: z
              .string()
              .refine((value2) => [...value2].length >= 1)
              .refine((value2) => [...value2].length <= 256),
            revision: z
              .string()
              .refine((value2) => [...value2].length >= 1)
              .refine((value2) => [...value2].length <= 256),
          })
          .strict(),
        z
          .object({
            action: z.literal("wallet_adjust"),
            deltaPoints: z
              .union([
                z
                  .string()
                  .regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                z
                  .number()
                  .refine(Number.isInteger)
                  .min(-9_007_199_254_740_991)
                  .max(9_007_199_254_740_991),
              ])
              .refine(
                (value2) =>
                  [
                    z
                      .string()
                      .regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    z
                      .number()
                      .refine(Number.isInteger)
                      .min(-9_007_199_254_740_991)
                      .max(9_007_199_254_740_991),
                  ].filter((validator) => validator.safeParse(value2).success)
                    .length === 1
              ),
            organizationId: z
              .union([
                z.string().regex(/^[1-9][0-9]{0,15}$/u),
                z
                  .number()
                  .refine(Number.isInteger)
                  .min(1)
                  .max(9_007_199_254_740_991),
                z.null(),
              ])
              .refine(
                (value2) =>
                  [
                    z.string().regex(/^[1-9][0-9]{0,15}$/u),
                    z
                      .number()
                      .refine(Number.isInteger)
                      .min(1)
                      .max(9_007_199_254_740_991),
                    z.null(),
                  ].filter((validator) => validator.safeParse(value2).success)
                    .length === 1
              )
              .optional(),
            reason: z.string(),
            resourceId: z
              .string()
              .refine((value2) => [...value2].length >= 1)
              .refine((value2) => [...value2].length <= 256)
              .regex(/^[1-9][0-9]{0,15}$/u),
          })
          .strict(),
        z
          .object({
            action: z.literal("refund_recovery"),
            customerResolutionReference: z
              .string()
              .refine((value2) => [...value2].length >= 3)
              .refine((value2) => [...value2].length <= 200),
            disposition: z.literal("customer_elected_original_entitlement"),
            reason: z.string(),
            resourceId: z
              .string()
              .refine((value2) => [...value2].length <= 10)
              .regex(/^[1-9][0-9]{0,9}$/u),
          })
          .strict(),
        z
          .object({
            action: z.literal("dispute_review"),
            evidenceReference: z
              .string()
              .refine((value2) => [...value2].length >= 3)
              .refine((value2) => [...value2].length <= 200)
              .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,199}$/u),
            reason: z.string(),
            resourceId: z
              .string()
              .refine((value2) => [...value2].length <= 10)
              .regex(/^[1-9][0-9]{0,9}$/u),
          })
          .strict(),
      ].filter((validator) => validator.safeParse(value0).success).length === 1
  );
export const ReconcileRequestSchema = z
  .object({
    approvalId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .optional(),
    decision: z.intersection(
      z.string(),
      z.union([
        z.literal("capture_reserved"),
        z.literal("release_reserved"),
        z.literal("charge_overage"),
      ])
    ),
    reason: z.string().optional(),
  })
  .strict();
export const ReconcileResponseSchema = z
  .object({
    capturedPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    decision: z.intersection(
      z.string(),
      z.union([
        z.literal("capture_reserved"),
        z.literal("release_reserved"),
        z.literal("charge_overage"),
      ])
    ),
    operationId: z.string(),
    requestId: z.string(),
    state: z.intersection(
      z.string(),
      z.union([z.literal("settled"), z.literal("released")])
    ),
  })
  .strict();
export const WalletAdjustmentRequestSchema = z
  .object({
    approvalId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .optional(),
    deltaPoints: z
      .union([
        z.string(),
        z
          .number()
          .refine(Number.isInteger)
          .min(-9_007_199_254_740_991)
          .max(9_007_199_254_740_991),
      ])
      .refine(
        (value1) =>
          [
            z.string(),
            z
              .number()
              .refine(Number.isInteger)
              .min(-9_007_199_254_740_991)
              .max(9_007_199_254_740_991),
          ].filter((validator) => validator.safeParse(value1).success)
            .length === 1
      ),
    idempotencyKey: z
      .string()
      .refine((value2) => [...value2].length >= 1)
      .refine((value2) => [...value2].length <= 128)
      .regex(/^[\x21-\x7e]+$/u)
      .optional(),
    organizationId: z.union([z.string(), z.number(), z.null()]).optional(),
    reason: z.string(),
  })
  .strict();
export const WalletAdjustmentEntrySchema = z
  .object({
    balanceAfter: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    createdAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    deltaPoints: z
      .string()
      .regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    eventType: z.literal("adjustment"),
    id: z.number().refine(Number.isInteger).min(1),
    idempotencyKey: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
    operationId: z.string(),
    organization: z.union([
      z.number().refine(Number.isInteger).min(1),
      z.null(),
    ]),
    sessionGroupId: z.string(),
    updatedAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    user: z.number().refine(Number.isInteger).min(1),
  })
  .strict();
export const WalletAdjustmentResponseSchema = z
  .union([
    z
      .object({
        balancePoints: z
          .string()
          .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
        entry: z
          .object({
            balanceAfter: z
              .string()
              .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            createdAt: z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            deltaPoints: z
              .string()
              .regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            eventType: z.literal("adjustment"),
            id: z.number().refine(Number.isInteger).min(1),
            idempotencyKey: z
              .string()
              .refine((value4) => [...value4].length >= 1)
              .refine((value4) => [...value4].length <= 128),
            operationId: z.string(),
            organization: z.union([
              z.number().refine(Number.isInteger).min(1),
              z.null(),
            ]),
            sessionGroupId: z.string(),
            updatedAt: z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            user: z.number().refine(Number.isInteger).min(1),
          })
          .strict(),
        idempotencyKey: z.string(),
        requestId: z.string(),
      })
      .strict(),
    z
      .object({
        duplicate: z.literal(true),
        entry: z
          .object({
            balanceAfter: z
              .string()
              .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            createdAt: z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            deltaPoints: z
              .string()
              .regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            eventType: z.literal("adjustment"),
            id: z.number().refine(Number.isInteger).min(1),
            idempotencyKey: z
              .string()
              .refine((value4) => [...value4].length >= 1)
              .refine((value4) => [...value4].length <= 128),
            operationId: z.string(),
            organization: z.union([
              z.number().refine(Number.isInteger).min(1),
              z.null(),
            ]),
            sessionGroupId: z.string(),
            updatedAt: z
              .string()
              .regex(
                /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
              )
              .datetime({ offset: true }),
            user: z.number().refine(Number.isInteger).min(1),
          })
          .strict(),
        idempotencyKey: z.string(),
        requestId: z.string(),
      })
      .strict(),
  ])
  .refine(
    (value0) =>
      [
        z
          .object({
            balancePoints: z
              .string()
              .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            entry: z
              .object({
                balanceAfter: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                createdAt: z
                  .string()
                  .regex(
                    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                  )
                  .datetime({ offset: true }),
                deltaPoints: z
                  .string()
                  .regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                eventType: z.literal("adjustment"),
                id: z.number().refine(Number.isInteger).min(1),
                idempotencyKey: z
                  .string()
                  .refine((value4) => [...value4].length >= 1)
                  .refine((value4) => [...value4].length <= 128),
                operationId: z.string(),
                organization: z.union([
                  z.number().refine(Number.isInteger).min(1),
                  z.null(),
                ]),
                sessionGroupId: z.string(),
                updatedAt: z
                  .string()
                  .regex(
                    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                  )
                  .datetime({ offset: true }),
                user: z.number().refine(Number.isInteger).min(1),
              })
              .strict(),
            idempotencyKey: z.string(),
            requestId: z.string(),
          })
          .strict(),
        z
          .object({
            duplicate: z.literal(true),
            entry: z
              .object({
                balanceAfter: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                createdAt: z
                  .string()
                  .regex(
                    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                  )
                  .datetime({ offset: true }),
                deltaPoints: z
                  .string()
                  .regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                eventType: z.literal("adjustment"),
                id: z.number().refine(Number.isInteger).min(1),
                idempotencyKey: z
                  .string()
                  .refine((value4) => [...value4].length >= 1)
                  .refine((value4) => [...value4].length <= 128),
                operationId: z.string(),
                organization: z.union([
                  z.number().refine(Number.isInteger).min(1),
                  z.null(),
                ]),
                sessionGroupId: z.string(),
                updatedAt: z
                  .string()
                  .regex(
                    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                  )
                  .datetime({ offset: true }),
                user: z.number().refine(Number.isInteger).min(1),
              })
              .strict(),
            idempotencyKey: z.string(),
            requestId: z.string(),
          })
          .strict(),
      ].filter((validator) => validator.safeParse(value0).success).length === 1
  );
export const PaymentEventResponseSchema = z
  .union([
    z
      .object({
        eventId: z.string(),
        status: z.intersection(
          z.string(),
          z.union([z.literal("processed"), z.literal("ignored")])
        ),
      })
      .strict(),
    z
      .object({
        eventId: z.string(),
        paymentId: z.number().refine(Number.isInteger).min(1),
        status: z.literal("processed"),
        subscriptionId: z.string(),
        subscriptionStatus: z.intersection(
          z.string(),
          z.union([
            z.literal("trialing"),
            z.literal("active"),
            z.literal("past_due"),
            z.literal("canceled"),
            z.literal("incomplete"),
          ])
        ),
      })
      .strict(),
    z
      .object({
        eventId: z.string(),
        paymentId: z.number().refine(Number.isInteger).min(1),
        reason: z.string(),
        status: z.literal("ignored"),
      })
      .strict(),
    z
      .object({
        balancePoints: z
          .string()
          .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
        eventId: z.string(),
        organizationId: z.union([
          z.number().refine(Number.isInteger).min(1),
          z.null(),
        ]),
        paymentId: z.number().refine(Number.isInteger).min(1),
        status: z.literal("processed"),
      })
      .strict(),
  ])
  .refine(
    (value0) =>
      [
        z
          .object({
            eventId: z.string(),
            status: z.intersection(
              z.string(),
              z.union([z.literal("processed"), z.literal("ignored")])
            ),
          })
          .strict(),
        z
          .object({
            eventId: z.string(),
            paymentId: z.number().refine(Number.isInteger).min(1),
            status: z.literal("processed"),
            subscriptionId: z.string(),
            subscriptionStatus: z.intersection(
              z.string(),
              z.union([
                z.literal("trialing"),
                z.literal("active"),
                z.literal("past_due"),
                z.literal("canceled"),
                z.literal("incomplete"),
              ])
            ),
          })
          .strict(),
        z
          .object({
            eventId: z.string(),
            paymentId: z.number().refine(Number.isInteger).min(1),
            reason: z.string(),
            status: z.literal("ignored"),
          })
          .strict(),
        z
          .object({
            balancePoints: z
              .string()
              .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            eventId: z.string(),
            organizationId: z.union([
              z.number().refine(Number.isInteger).min(1),
              z.null(),
            ]),
            paymentId: z.number().refine(Number.isInteger).min(1),
            status: z.literal("processed"),
          })
          .strict(),
      ].filter((validator) => validator.safeParse(value0).success).length === 1
  );
export const PaymentReplayResponseSchema = z
  .union([
    z
      .union([
        z
          .object({
            eventId: z.string(),
            status: z.intersection(
              z.string(),
              z.union([z.literal("processed"), z.literal("ignored")])
            ),
          })
          .strict(),
        z
          .object({
            eventId: z.string(),
            paymentId: z.number().refine(Number.isInteger).min(1),
            status: z.literal("processed"),
            subscriptionId: z.string(),
            subscriptionStatus: z.intersection(
              z.string(),
              z.union([
                z.literal("trialing"),
                z.literal("active"),
                z.literal("past_due"),
                z.literal("canceled"),
                z.literal("incomplete"),
              ])
            ),
          })
          .strict(),
        z
          .object({
            eventId: z.string(),
            paymentId: z.number().refine(Number.isInteger).min(1),
            reason: z.string(),
            status: z.literal("ignored"),
          })
          .strict(),
        z
          .object({
            balancePoints: z
              .string()
              .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            eventId: z.string(),
            organizationId: z.union([
              z.number().refine(Number.isInteger).min(1),
              z.null(),
            ]),
            paymentId: z.number().refine(Number.isInteger).min(1),
            status: z.literal("processed"),
          })
          .strict(),
      ])
      .refine(
        (value2) =>
          [
            z
              .object({
                eventId: z.string(),
                status: z.intersection(
                  z.string(),
                  z.union([z.literal("processed"), z.literal("ignored")])
                ),
              })
              .strict(),
            z
              .object({
                eventId: z.string(),
                paymentId: z.number().refine(Number.isInteger).min(1),
                status: z.literal("processed"),
                subscriptionId: z.string(),
                subscriptionStatus: z.intersection(
                  z.string(),
                  z.union([
                    z.literal("trialing"),
                    z.literal("active"),
                    z.literal("past_due"),
                    z.literal("canceled"),
                    z.literal("incomplete"),
                  ])
                ),
              })
              .strict(),
            z
              .object({
                eventId: z.string(),
                paymentId: z.number().refine(Number.isInteger).min(1),
                reason: z.string(),
                status: z.literal("ignored"),
              })
              .strict(),
            z
              .object({
                balancePoints: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                eventId: z.string(),
                organizationId: z.union([
                  z.number().refine(Number.isInteger).min(1),
                  z.null(),
                ]),
                paymentId: z.number().refine(Number.isInteger).min(1),
                status: z.literal("processed"),
              })
              .strict(),
          ].filter((validator) => validator.safeParse(value2).success)
            .length === 1
      ),
    z
      .object({
        eventId: z.string(),
        replayed: z.literal(false),
        status: z.intersection(
          z.string(),
          z.union([z.literal("processed"), z.literal("ignored")])
        ),
      })
      .strict(),
  ])
  .refine(
    (value0) =>
      [
        z
          .union([
            z
              .object({
                eventId: z.string(),
                status: z.intersection(
                  z.string(),
                  z.union([z.literal("processed"), z.literal("ignored")])
                ),
              })
              .strict(),
            z
              .object({
                eventId: z.string(),
                paymentId: z.number().refine(Number.isInteger).min(1),
                status: z.literal("processed"),
                subscriptionId: z.string(),
                subscriptionStatus: z.intersection(
                  z.string(),
                  z.union([
                    z.literal("trialing"),
                    z.literal("active"),
                    z.literal("past_due"),
                    z.literal("canceled"),
                    z.literal("incomplete"),
                  ])
                ),
              })
              .strict(),
            z
              .object({
                eventId: z.string(),
                paymentId: z.number().refine(Number.isInteger).min(1),
                reason: z.string(),
                status: z.literal("ignored"),
              })
              .strict(),
            z
              .object({
                balancePoints: z
                  .string()
                  .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                eventId: z.string(),
                organizationId: z.union([
                  z.number().refine(Number.isInteger).min(1),
                  z.null(),
                ]),
                paymentId: z.number().refine(Number.isInteger).min(1),
                status: z.literal("processed"),
              })
              .strict(),
          ])
          .refine(
            (value2) =>
              [
                z
                  .object({
                    eventId: z.string(),
                    status: z.intersection(
                      z.string(),
                      z.union([z.literal("processed"), z.literal("ignored")])
                    ),
                  })
                  .strict(),
                z
                  .object({
                    eventId: z.string(),
                    paymentId: z.number().refine(Number.isInteger).min(1),
                    status: z.literal("processed"),
                    subscriptionId: z.string(),
                    subscriptionStatus: z.intersection(
                      z.string(),
                      z.union([
                        z.literal("trialing"),
                        z.literal("active"),
                        z.literal("past_due"),
                        z.literal("canceled"),
                        z.literal("incomplete"),
                      ])
                    ),
                  })
                  .strict(),
                z
                  .object({
                    eventId: z.string(),
                    paymentId: z.number().refine(Number.isInteger).min(1),
                    reason: z.string(),
                    status: z.literal("ignored"),
                  })
                  .strict(),
                z
                  .object({
                    balancePoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    eventId: z.string(),
                    organizationId: z.union([
                      z.number().refine(Number.isInteger).min(1),
                      z.null(),
                    ]),
                    paymentId: z.number().refine(Number.isInteger).min(1),
                    status: z.literal("processed"),
                  })
                  .strict(),
              ].filter((validator) => validator.safeParse(value2).success)
                .length === 1
          ),
        z
          .object({
            eventId: z.string(),
            replayed: z.literal(false),
            status: z.intersection(
              z.string(),
              z.union([z.literal("processed"), z.literal("ignored")])
            ),
          })
          .strict(),
      ].filter((validator) => validator.safeParse(value0).success).length === 1
  );
export const PaymentErrorSchema = z
  .object({
    code: z.string(),
    eventId: z.string().optional(),
    message: z.string().optional(),
    requestId: z.string().optional(),
  })
  .strict();
export const PaymentReplayRequestSchema = z
  .object({
    eventId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256),
    provider: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
  })
  .strict();
export const PaymentReconcileRequestSchema = z
  .object({
    limit: z.number().refine(Number.isInteger).min(1).max(100).optional(),
  })
  .strict();
export const PaymentReconcileResponseSchema = z
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
export const StripeWebhookRequestSchema = z
  .object({
    account: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    amountCents: z
      .number()
      .refine(Number.isInteger)
      .min(0)
      .max(9_007_199_254_740_991)
      .optional(),
    cancelAtPeriodEnd: z.boolean().optional(),
    checkoutId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    created: z.number().refine(Number.isInteger).min(0).max(253_402_300_799),
    currency: z
      .string()
      .regex(/^[A-Za-z]{3}$/u)
      .optional(),
    currentPeriodEnd: z
      .union([
        z
          .string()
          .regex(
            /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
          )
          .datetime({ offset: true }),
        z.null(),
      ])
      .optional(),
    currentPeriodStart: z
      .union([
        z
          .string()
          .regex(
            /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
          )
          .datetime({ offset: true }),
        z.null(),
      ])
      .optional(),
    customerRef: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    data: z
      .object({
        object: z
          .object({
            amount: z
              .number()
              .refine(Number.isInteger)
              .min(0)
              .max(9_007_199_254_740_991)
              .optional(),
            amount_capturable: z
              .number()
              .refine(Number.isInteger)
              .min(0)
              .max(9_007_199_254_740_991)
              .optional(),
            amount_captured: z
              .number()
              .refine(Number.isInteger)
              .min(0)
              .max(9_007_199_254_740_991)
              .optional(),
            amount_received: z
              .number()
              .refine(Number.isInteger)
              .min(0)
              .max(9_007_199_254_740_991)
              .optional(),
            amount_refunded: z
              .number()
              .refine(Number.isInteger)
              .min(0)
              .max(9_007_199_254_740_991)
              .optional(),
            amount_total: z
              .number()
              .refine(Number.isInteger)
              .min(0)
              .max(9_007_199_254_740_991)
              .optional(),
            captured: z.boolean().optional(),
            charge: z
              .union([
                z
                  .string()
                  .refine((value4) => [...value4].length >= 1)
                  .refine((value4) => [...value4].length <= 256)
                  .regex(
                    // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                    /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                  ),
                z
                  .object({
                    id: z
                      .string()
                      .refine((value5) => [...value5].length >= 1)
                      .refine((value5) => [...value5].length <= 256)
                      .regex(
                        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                      ),
                    object: z.literal("charge"),
                    payment_intent: z
                      .union([
                        z
                          .string()
                          .refine((value6) => [...value6].length >= 1)
                          .refine((value6) => [...value6].length <= 256)
                          .regex(
                            // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                            /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                          ),
                        z
                          .object({
                            id: z
                              .string()
                              .refine((value7) => [...value7].length >= 1)
                              .refine((value7) => [...value7].length <= 256)
                              .regex(
                                // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                                /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                              ),
                            object: z.literal("payment_intent"),
                          })
                          .passthrough(),
                        z.null(),
                      ])
                      .optional(),
                  })
                  .passthrough(),
                z.null(),
              ])
              .optional(),
            client_reference_id: z
              .union([
                z
                  .string()
                  .refine((value4) => [...value4].length >= 1)
                  .refine((value4) => [...value4].length <= 128)
                  .regex(
                    // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                    /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                  ),
                z.null(),
              ])
              .optional(),
            currency: z
              .string()
              .regex(/^[A-Za-z]{3}$/u)
              .optional(),
            id: z
              .string()
              .refine((value3) => [...value3].length >= 1)
              .refine((value3) => [...value3].length <= 256)
              .regex(
                // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
              )
              .optional(),
            metadata: z
              .union([z.object({}).passthrough(), z.null()])
              .optional(),
            mode: z
              .string()
              .refine((value3) => [...value3].length >= 1)
              .refine((value3) => [...value3].length <= 128)
              .regex(
                // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
              )
              .optional(),
            object: z
              .string()
              .refine((value3) => [...value3].length >= 1)
              .refine((value3) => [...value3].length <= 128)
              .regex(
                // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
              )
              .optional(),
            paid: z.boolean().optional(),
            payment_intent: z
              .union([
                z
                  .string()
                  .refine((value4) => [...value4].length >= 1)
                  .refine((value4) => [...value4].length <= 256)
                  .regex(
                    // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                    /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                  ),
                z
                  .object({
                    id: z
                      .string()
                      .refine((value5) => [...value5].length >= 1)
                      .refine((value5) => [...value5].length <= 256)
                      .regex(
                        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                      ),
                    object: z.literal("payment_intent"),
                  })
                  .passthrough(),
                z.null(),
              ])
              .optional(),
            payment_status: z
              .string()
              .refine((value3) => [...value3].length >= 1)
              .refine((value3) => [...value3].length <= 128)
              .regex(
                // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
              )
              .optional(),
            status: z
              .string()
              .refine((value3) => [...value3].length >= 1)
              .refine((value3) => [...value3].length <= 128)
              .regex(
                // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
              )
              .optional(),
          })
          .passthrough(),
      })
      .passthrough(),
    expiresAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true })
      .optional(),
    grossAmountMinor: z
      .number()
      .refine(Number.isInteger)
      .min(0)
      .max(9_007_199_254_740_991)
      .optional(),
    id: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      ),
    metadata: z.object({}).passthrough().optional(),
    occurredAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true })
      .optional(),
    organizationId: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(9_007_199_254_740_991)
      .optional(),
    planSlug: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    points: z
      .union([
        z.string().regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
        z.number().refine(Number.isInteger).min(0).max(9_007_199_254_740_991),
      ])
      .optional(),
    providerAccount: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    refundAmountMinor: z
      .number()
      .refine(Number.isInteger)
      .min(0)
      .max(9_007_199_254_740_991)
      .optional(),
    refundedGrantPoints: z
      .union([
        z.string().regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
        z.number().refine(Number.isInteger).min(0).max(9_007_199_254_740_991),
      ])
      .optional(),
    refundId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    signature: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 2048)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    status: z
      .intersection(
        z.string(),
        z.union([
          z.literal("trialing"),
          z.literal("active"),
          z.literal("past_due"),
          z.literal("canceled"),
          z.literal("incomplete"),
        ])
      )
      .optional(),
    subscriptionId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      )
      .optional(),
    type: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      ),
    userId: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(9_007_199_254_740_991)
      .optional(),
  })
  .passthrough();
export const ProviderWebhookRequestSchema = z.union([
  z
    .object({
      amountCents: z
        .number()
        .refine(Number.isInteger)
        .min(0)
        .max(9_007_199_254_740_991)
        .optional(),
      cancelAtPeriodEnd: z.boolean().optional(),
      checkoutId: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 128)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      currency: z
        .string()
        .regex(/^[A-Za-z]{3}$/u)
        .optional(),
      currentPeriodEnd: z
        .union([
          z
            .string()
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
          z.null(),
        ])
        .optional(),
      currentPeriodStart: z
        .union([
          z
            .string()
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
          z.null(),
        ])
        .optional(),
      customerRef: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 256)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      eventType: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 128)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        ),
      expiresAt: z
        .string()
        .regex(
          /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
        )
        .datetime({ offset: true })
        .optional(),
      grossAmountMinor: z
        .number()
        .refine(Number.isInteger)
        .min(0)
        .max(9_007_199_254_740_991)
        .optional(),
      metadata: z.object({}).passthrough().optional(),
      occurredAt: z
        .string()
        .regex(
          /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
        )
        .datetime({ offset: true })
        .optional(),
      organizationId: z
        .number()
        .refine(Number.isInteger)
        .min(1)
        .max(9_007_199_254_740_991)
        .optional(),
      planSlug: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 128)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      points: z
        .union([
          z.string().regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          z.number().refine(Number.isInteger).min(0).max(9_007_199_254_740_991),
        ])
        .optional(),
      providerAccount: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 256)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      providerEventId: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 256)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        ),
      refundAmountMinor: z
        .number()
        .refine(Number.isInteger)
        .min(0)
        .max(9_007_199_254_740_991)
        .optional(),
      refundedGrantPoints: z
        .union([
          z.string().regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          z.number().refine(Number.isInteger).min(0).max(9_007_199_254_740_991),
        ])
        .optional(),
      refundId: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 128)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      signature: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 2048)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      status: z
        .intersection(
          z.string(),
          z.union([
            z.literal("trialing"),
            z.literal("active"),
            z.literal("past_due"),
            z.literal("canceled"),
            z.literal("incomplete"),
          ])
        )
        .optional(),
      subscriptionId: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 128)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      userId: z
        .number()
        .refine(Number.isInteger)
        .min(1)
        .max(9_007_199_254_740_991)
        .optional(),
    })
    .strict(),
  z
    .object({
      account: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 256)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      amountCents: z
        .number()
        .refine(Number.isInteger)
        .min(0)
        .max(9_007_199_254_740_991)
        .optional(),
      cancelAtPeriodEnd: z.boolean().optional(),
      checkoutId: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 128)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      created: z.number().refine(Number.isInteger).min(0).max(253_402_300_799),
      currency: z
        .string()
        .regex(/^[A-Za-z]{3}$/u)
        .optional(),
      currentPeriodEnd: z
        .union([
          z
            .string()
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
          z.null(),
        ])
        .optional(),
      currentPeriodStart: z
        .union([
          z
            .string()
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
          z.null(),
        ])
        .optional(),
      customerRef: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 256)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      data: z
        .object({
          object: z
            .object({
              amount: z
                .number()
                .refine(Number.isInteger)
                .min(0)
                .max(9_007_199_254_740_991)
                .optional(),
              amount_capturable: z
                .number()
                .refine(Number.isInteger)
                .min(0)
                .max(9_007_199_254_740_991)
                .optional(),
              amount_captured: z
                .number()
                .refine(Number.isInteger)
                .min(0)
                .max(9_007_199_254_740_991)
                .optional(),
              amount_received: z
                .number()
                .refine(Number.isInteger)
                .min(0)
                .max(9_007_199_254_740_991)
                .optional(),
              amount_refunded: z
                .number()
                .refine(Number.isInteger)
                .min(0)
                .max(9_007_199_254_740_991)
                .optional(),
              amount_total: z
                .number()
                .refine(Number.isInteger)
                .min(0)
                .max(9_007_199_254_740_991)
                .optional(),
              captured: z.boolean().optional(),
              charge: z
                .union([
                  z
                    .string()
                    .refine((value6) => [...value6].length >= 1)
                    .refine((value6) => [...value6].length <= 256)
                    .regex(
                      // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                      /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                    ),
                  z
                    .object({
                      id: z
                        .string()
                        .refine((value7) => [...value7].length >= 1)
                        .refine((value7) => [...value7].length <= 256)
                        .regex(
                          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                        ),
                      object: z.literal("charge"),
                      payment_intent: z
                        .union([
                          z
                            .string()
                            .refine((value8) => [...value8].length >= 1)
                            .refine((value8) => [...value8].length <= 256)
                            .regex(
                              // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                              /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                            ),
                          z
                            .object({
                              id: z
                                .string()
                                .refine((value9) => [...value9].length >= 1)
                                .refine((value9) => [...value9].length <= 256)
                                .regex(
                                  // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                                  /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                                ),
                              object: z.literal("payment_intent"),
                            })
                            .passthrough(),
                          z.null(),
                        ])
                        .optional(),
                    })
                    .passthrough(),
                  z.null(),
                ])
                .optional(),
              client_reference_id: z
                .union([
                  z
                    .string()
                    .refine((value6) => [...value6].length >= 1)
                    .refine((value6) => [...value6].length <= 128)
                    .regex(
                      // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                      /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                    ),
                  z.null(),
                ])
                .optional(),
              currency: z
                .string()
                .regex(/^[A-Za-z]{3}$/u)
                .optional(),
              id: z
                .string()
                .refine((value5) => [...value5].length >= 1)
                .refine((value5) => [...value5].length <= 256)
                .regex(
                  // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                  /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                )
                .optional(),
              metadata: z
                .union([z.object({}).passthrough(), z.null()])
                .optional(),
              mode: z
                .string()
                .refine((value5) => [...value5].length >= 1)
                .refine((value5) => [...value5].length <= 128)
                .regex(
                  // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                  /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                )
                .optional(),
              object: z
                .string()
                .refine((value5) => [...value5].length >= 1)
                .refine((value5) => [...value5].length <= 128)
                .regex(
                  // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                  /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                )
                .optional(),
              paid: z.boolean().optional(),
              payment_intent: z
                .union([
                  z
                    .string()
                    .refine((value6) => [...value6].length >= 1)
                    .refine((value6) => [...value6].length <= 256)
                    .regex(
                      // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                      /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                    ),
                  z
                    .object({
                      id: z
                        .string()
                        .refine((value7) => [...value7].length >= 1)
                        .refine((value7) => [...value7].length <= 256)
                        .regex(
                          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                        ),
                      object: z.literal("payment_intent"),
                    })
                    .passthrough(),
                  z.null(),
                ])
                .optional(),
              payment_status: z
                .string()
                .refine((value5) => [...value5].length >= 1)
                .refine((value5) => [...value5].length <= 128)
                .regex(
                  // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                  /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                )
                .optional(),
              status: z
                .string()
                .refine((value5) => [...value5].length >= 1)
                .refine((value5) => [...value5].length <= 128)
                .regex(
                  // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
                  /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
                )
                .optional(),
            })
            .passthrough(),
        })
        .passthrough(),
      expiresAt: z
        .string()
        .regex(
          /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
        )
        .datetime({ offset: true })
        .optional(),
      grossAmountMinor: z
        .number()
        .refine(Number.isInteger)
        .min(0)
        .max(9_007_199_254_740_991)
        .optional(),
      id: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 256)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        ),
      metadata: z.object({}).passthrough().optional(),
      occurredAt: z
        .string()
        .regex(
          /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
        )
        .datetime({ offset: true })
        .optional(),
      organizationId: z
        .number()
        .refine(Number.isInteger)
        .min(1)
        .max(9_007_199_254_740_991)
        .optional(),
      planSlug: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 128)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      points: z
        .union([
          z.string().regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          z.number().refine(Number.isInteger).min(0).max(9_007_199_254_740_991),
        ])
        .optional(),
      providerAccount: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 256)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      refundAmountMinor: z
        .number()
        .refine(Number.isInteger)
        .min(0)
        .max(9_007_199_254_740_991)
        .optional(),
      refundedGrantPoints: z
        .union([
          z.string().regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          z.number().refine(Number.isInteger).min(0).max(9_007_199_254_740_991),
        ])
        .optional(),
      refundId: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 128)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      signature: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 2048)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      status: z
        .intersection(
          z.string(),
          z.union([
            z.literal("trialing"),
            z.literal("active"),
            z.literal("past_due"),
            z.literal("canceled"),
            z.literal("incomplete"),
          ])
        )
        .optional(),
      subscriptionId: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 128)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        )
        .optional(),
      type: z
        .string()
        .refine((value3) => [...value3].length >= 1)
        .refine((value3) => [...value3].length <= 128)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
        ),
      userId: z
        .number()
        .refine(Number.isInteger)
        .min(1)
        .max(9_007_199_254_740_991)
        .optional(),
    })
    .passthrough(),
]);
export const PortaReceiptStatusResponseSchema = z
  .object({
    attemptId: z
      .string()
      .refine((value2) => [...value2].length >= 1)
      .refine((value2) => [...value2].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?!\.{1,2}(?![\s\S]))[^\u0000\uD800-\uDFFF]+$/u
      ),
    dispatchEvidence: z.intersection(
      z.string(),
      z.union([
        z.literal("not_dispatched"),
        z.literal("started"),
        z.literal("response"),
        z.literal("unknown"),
      ])
    ),
    receiptId: z.union([z.string(), z.null()]),
    state: z.intersection(
      z.string(),
      z.union([
        z.literal("pending"),
        z.literal("complete"),
        z.literal("not_dispatched"),
      ])
    ),
  })
  .strict();
export const PortaErrorSchema = z
  .object({
    porta_error: z.object({ code: z.string(), message: z.string() }).strict(),
  })
  .strict();
export const SessionPageSchema = z
  .object({
    hasMore: z.boolean(),
    limit: z.number().refine(Number.isInteger).min(1).max(1000),
    nextCursor: z.union([
      z.string().refine((value2) => [...value2].length <= 512),
      z.null(),
    ]),
    totalSteps: z
      .number()
      .refine(Number.isInteger)
      .min(0)
      .max(9_007_199_254_740_991),
  })
  .strict();
export const SessionAggregatePointsSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,63})(?:\.[0-9]{1,6})?$/u);
export const OverviewDateSchema = z.union([
  z
    .string()
    .refine((value1) => [...value1].length <= 10)
    .regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u)
    .date(),
  z
    .string()
    .refine((value1) => [...value1].length <= 64)
    .regex(
      /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
    )
    .datetime({ offset: true }),
]);
export const OrganizationScopeQuerySchema = z
  .string()
  .regex(/^(?:|[1-9][0-9]{0,15})$/u);
export const OrganizationScopeSchema = z
  .union([
    z.string().regex(/^(?:|[1-9][0-9]{0,15})$/u),
    z.number().refine(Number.isInteger).min(1).max(9_007_199_254_740_991),
    z.null(),
  ])
  .refine(
    (value0) =>
      [
        z.string().regex(/^(?:|[1-9][0-9]{0,15})$/u),
        z.number().refine(Number.isInteger).min(1).max(9_007_199_254_740_991),
        z.null(),
      ].filter((validator) => validator.safeParse(value0).success).length === 1
  );
export const IdempotencyKeySchema = z
  .string()
  .refine((value0) => [...value0].length >= 1)
  .refine((value0) => [...value0].length <= 128)
  .regex(/^[\x21-\x7e]+$/u);
export const RequestIdSchema = z
  .string()
  .refine((value0) => [...value0].length >= 1)
  .refine((value0) => [...value0].length <= 128);
export const AttemptIdSchema = z
  .string()
  .refine((value0) => [...value0].length >= 1)
  .refine((value0) => [...value0].length <= 128)
  .regex(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
    /^(?!\.{1,2}(?![\s\S]))[^\u0000\uD800-\uDFFF]+$/u
  );
export const PaymentSubscriptionFactsSchema = z
  .object({
    cancelAtPeriodEnd: z.boolean().optional(),
    currentPeriodEnd: z
      .union([
        z
          .string()
          .regex(
            /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
          )
          .datetime({ offset: true }),
        z.null(),
      ])
      .optional(),
    currentPeriodStart: z
      .union([
        z
          .string()
          .regex(
            /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
          )
          .datetime({ offset: true }),
        z.null(),
      ])
      .optional(),
    metadata: z.object({}).passthrough().optional(),
    planSlug: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      ),
    status: z.intersection(
      z.string(),
      z.union([
        z.literal("trialing"),
        z.literal("active"),
        z.literal("past_due"),
        z.literal("canceled"),
        z.literal("incomplete"),
      ])
    ),
    subscriptionId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128)
      .regex(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
        /^(?![\s\S]*[\u0000\uD800-\uDFFF])(?=[\s\S]*\S)[\s\S]+$/u
      ),
  })
  .strict();
export const RefundRecoverySnapshotSchema = z
  .object({
    accountId: z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
    amountMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,15})$/u),
    availablePoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    capturedMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,15})$/u),
    chargeId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256),
    checkoutId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256),
    checkoutIntentId: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(2_147_483_647),
    checkoutRevision: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    coveredEvents: z
      .array(
        z
          .object({
            id: z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
            payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
          })
          .strict()
      )
      .min(1)
      .max(200),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    customerResolutionReference: z
      .string()
      .refine((value1) => [...value1].length >= 3)
      .refine((value1) => [...value1].length <= 200),
    disposition: z.literal("customer_elected_original_entitlement"),
    evidenceRetrievedAt: z
      .string()
      .regex(
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
      )
      .datetime({ offset: true }),
    expiredAvailablePoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    expiredPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    factSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
    failureBalanceTransactionId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256),
    failureReason: z.string().regex(/^[a-z_]{1,128}$/u),
    grantId: z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
    grantVersion: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(9_007_199_254_740_991),
    grossRefundMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,63})$/u),
    livemode: z.boolean(),
    lossPosition: z.union([
      z
        .object({
          disputeFundedAfterPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          disputeGapAfterPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          disputeTargetAfterPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          disputeTargetBeforePoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          movements: z
            .array(
              z
                .object({
                  from: z.union([
                    z.literal("available"),
                    z.literal("refunded"),
                    z.literal("disputed"),
                    z.literal("expired"),
                  ]),
                  points: z
                    .string()
                    .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                  to: z.union([
                    z.literal("available"),
                    z.literal("refunded"),
                    z.literal("disputed"),
                    z.literal("expired"),
                  ]),
                })
                .strict()
            )
            .max(8),
          refundFundedAfterPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          refundGapAfterPoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          reviewRequired: z.boolean(),
          transferredToDisputePoints: z
            .string()
            .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
        })
        .strict(),
      z.null(),
    ]),
    organizationId: z.union([
      z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
      z.null(),
    ]),
    originalBalanceTransactionId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256),
    originalExpiresAt: z.union([
      z
        .string()
        .regex(
          /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
        )
        .datetime({ offset: true }),
      z.null(),
    ]),
    paymentEventId: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(2_147_483_647),
    priorRecoveryMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,63})$/u),
    providerAccount: z.union([
      z
        .string()
        .refine((value2) => [...value2].length >= 1)
        .refine((value2) => [...value2].length <= 256),
      z.null(),
    ]),
    providerEvidenceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    providerPaymentId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256),
    providerRequestId: z.union([
      z
        .string()
        .refine((value2) => [...value2].length >= 1)
        .refine((value2) => [...value2].length <= 256),
      z.null(),
    ]),
    providerState: z.intersection(
      z.string(),
      z.union([z.literal("failed"), z.literal("canceled")])
    ),
    recoveredPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    refundEventId: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(2_147_483_647),
    refundId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256),
    targetAfterPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    targetBeforePoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    userId: z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
    walletDeltaPoints: z
      .string()
      .regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    walletVersion: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(9_007_199_254_740_991),
  })
  .strict();
export const BillingApprovalExecutionRequestSchema = z
  .object({
    approvalId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 128),
  })
  .strict();
export const BillingApprovalExecutionResponseSchema = z
  .object({
    approval: z
      .object({
        action: z.intersection(
          z.string(),
          z.union([
            z.literal("reconcile"),
            z.literal("wallet_adjust"),
            z.literal("refund_recovery"),
            z.literal("dispute_review"),
          ])
        ),
        approvalId: z.string(),
        approvedAt: z.union([
          z
            .string()
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
          z.null(),
        ]),
        approvedBy: z.union([
          z.number().refine(Number.isInteger).min(1),
          z.null(),
        ]),
        consumedAt: z.union([
          z
            .string()
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
          z.null(),
        ]),
        decision: z.union([z.string(), z.null()]),
        deltaPoints: z.union([
          z.string().regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
          z.null(),
        ]),
        disputeReviewSnapshot: z.union([
          z
            .object({
              caseCount: z.number().refine(Number.isInteger).min(1).max(1000),
              checkoutId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              checkoutIntentId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              coverageHash: z.string().regex(/^[a-f0-9]{64}$/u),
              disputeTargetPoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              evidenceReference: z
                .string()
                .refine((value6) => [...value6].length >= 3)
                .refine((value6) => [...value6].length <= 200)
                .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,199}$/u),
              expiresAt: z.union([
                z
                  .string()
                  .regex(
                    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                  )
                  .datetime({ offset: true }),
                z.null(),
              ]),
              grantId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              grantVersion: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(9_007_199_254_740_991),
              organizationId: z.union([
                z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
                z.null(),
              ]),
              refundTargetPoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              sourcePaymentEventId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              spendablePoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
            })
            .strict(),
          z.null(),
        ]),
        expiresAt: z
          .string()
          .regex(
            /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
          )
          .datetime({ offset: true }),
        mutationHash: z.union([z.string(), z.null()]),
        organizationId: z.union([
          z.number().refine(Number.isInteger).min(1).max(9_007_199_254_740_991),
          z.null(),
        ]),
        reason: z.string(),
        recoverySnapshot: z.union([
          z
            .object({
              accountId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              amountMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,15})$/u),
              availablePoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              capturedMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,15})$/u),
              chargeId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              checkoutId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              checkoutIntentId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              checkoutRevision: z
                .string()
                .regex(
                  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                )
                .datetime({ offset: true }),
              coveredEvents: z
                .array(
                  z
                    .object({
                      id: z
                        .number()
                        .refine(Number.isInteger)
                        .min(1)
                        .max(2_147_483_647),
                      payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
                    })
                    .strict()
                )
                .min(1)
                .max(200),
              currency: z.string().regex(/^[A-Z]{3}$/u),
              customerResolutionReference: z
                .string()
                .refine((value6) => [...value6].length >= 3)
                .refine((value6) => [...value6].length <= 200),
              disposition: z.literal("customer_elected_original_entitlement"),
              evidenceRetrievedAt: z
                .string()
                .regex(
                  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                )
                .datetime({ offset: true }),
              expiredAvailablePoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              expiredPoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              factSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
              failureBalanceTransactionId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              failureReason: z.string().regex(/^[a-z_]{1,128}$/u),
              grantId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              grantVersion: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(9_007_199_254_740_991),
              grossRefundMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,63})$/u),
              livemode: z.boolean(),
              lossPosition: z.union([
                z
                  .object({
                    disputeFundedAfterPoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    disputeGapAfterPoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    disputeTargetAfterPoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    disputeTargetBeforePoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    movements: z
                      .array(
                        z
                          .object({
                            from: z.union([
                              z.literal("available"),
                              z.literal("refunded"),
                              z.literal("disputed"),
                              z.literal("expired"),
                            ]),
                            points: z
                              .string()
                              .regex(
                                /^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u
                              ),
                            to: z.union([
                              z.literal("available"),
                              z.literal("refunded"),
                              z.literal("disputed"),
                              z.literal("expired"),
                            ]),
                          })
                          .strict()
                      )
                      .max(8),
                    refundFundedAfterPoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    refundGapAfterPoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                    reviewRequired: z.boolean(),
                    transferredToDisputePoints: z
                      .string()
                      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
                  })
                  .strict(),
                z.null(),
              ]),
              organizationId: z.union([
                z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
                z.null(),
              ]),
              originalBalanceTransactionId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              originalExpiresAt: z.union([
                z
                  .string()
                  .regex(
                    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
                  )
                  .datetime({ offset: true }),
                z.null(),
              ]),
              paymentEventId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              priorRecoveryMinor: z.string().regex(/^(?:0|[1-9][0-9]{0,63})$/u),
              providerAccount: z.union([
                z
                  .string()
                  .refine((value7) => [...value7].length >= 1)
                  .refine((value7) => [...value7].length <= 256),
                z.null(),
              ]),
              providerEvidenceHash: z.string().regex(/^[a-f0-9]{64}$/u),
              providerPaymentId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              providerRequestId: z.union([
                z
                  .string()
                  .refine((value7) => [...value7].length >= 1)
                  .refine((value7) => [...value7].length <= 256),
                z.null(),
              ]),
              providerState: z.intersection(
                z.string(),
                z.union([z.literal("failed"), z.literal("canceled")])
              ),
              recoveredPoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              refundEventId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              refundId: z
                .string()
                .refine((value6) => [...value6].length >= 1)
                .refine((value6) => [...value6].length <= 256),
              targetAfterPoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              targetBeforePoints: z
                .string()
                .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              userId: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(2_147_483_647),
              walletDeltaPoints: z
                .string()
                .regex(/^-?(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
              walletVersion: z
                .number()
                .refine(Number.isInteger)
                .min(1)
                .max(9_007_199_254_740_991),
            })
            .strict(),
          z.null(),
        ]),
        requestedBy: z.number().refine(Number.isInteger).min(1),
        requestedRevision: z.string(),
        resourceId: z.string(),
        status: z.intersection(
          z.string(),
          z.union([
            z.literal("pending"),
            z.literal("approved"),
            z.literal("consumed"),
            z.literal("rejected"),
            z.literal("expired"),
          ])
        ),
      })
      .strict(),
    duplicate: z.boolean(),
    requestId: z
      .string()
      .refine((value2) => [...value2].length >= 1)
      .refine((value2) => [...value2].length <= 128),
  })
  .strict();
export const AggregateMinorUnitsSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,63})$/u);
export const DisputeReviewSnapshotSchema = z
  .object({
    caseCount: z.number().refine(Number.isInteger).min(1).max(1000),
    checkoutId: z
      .string()
      .refine((value1) => [...value1].length >= 1)
      .refine((value1) => [...value1].length <= 256),
    checkoutIntentId: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(2_147_483_647),
    coverageHash: z.string().regex(/^[a-f0-9]{64}$/u),
    disputeTargetPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    evidenceReference: z
      .string()
      .refine((value1) => [...value1].length >= 3)
      .refine((value1) => [...value1].length <= 200)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,199}$/u),
    expiresAt: z.union([
      z
        .string()
        .regex(
          /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
        )
        .datetime({ offset: true }),
      z.null(),
    ]),
    grantId: z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
    grantVersion: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(9_007_199_254_740_991),
    organizationId: z.union([
      z.number().refine(Number.isInteger).min(1).max(2_147_483_647),
      z.null(),
    ]),
    refundTargetPoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
    sourcePaymentEventId: z
      .number()
      .refine(Number.isInteger)
      .min(1)
      .max(2_147_483_647),
    spendablePoints: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})(?:\.[0-9]{1,6})?$/u),
  })
  .strict();

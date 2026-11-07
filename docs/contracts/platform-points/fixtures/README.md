# Platform Points v1 contract fixtures

This directory is the current `v1` contract snapshot source until the Payload platform repository becomes the producer. Fixtures are deterministic, synthetic, secret-free and safe to load in unit/contract tests.

## Files

| File | Covers |
|---|---|
| `canonical-json-vectors.json` | Existing permit canonicalization vector |
| `model-success.json` | Model reserve → dispatch → usage report → capture |
| `tool-success.json` | Tool reserve → permit → Porta receipt → capture |
| `payment-completed.json` | Checkout intent → signed webhook → wallet grant |
| `payment-refund.json` | Refund webhook → negative ledger adjustment → replay |
| `negative-cases.json` | Insufficient points, platform unavailable, replay, timeout, duplicate webhook, checkout subject mismatch, organization disabled |
| `state-transitions.json` | Allowed/forbidden ChatNest, Payload and payment transitions |

The authenticated checkout status read (`GET /payments/checkout/{checkoutId}`)
is a projection over the checkout intent; it never mutates wallet or ledger and
does not trust return-query amounts or points.

Related schemas live one level up in `schemas/`: `operation.json`, `permit.json`, `receipt.json` and `payment-event.json`.

## Fixture invariants

1. `apiVersion` is `v1`; `schemaRevision` is `2026-10-31.1`.
2. `pointScale` is `1_000_000`; points are decimal strings, never JavaScript numbers.
3. IDs are deterministic and prefixed by entity (`op_`, `att_`, `hold_`, `receipt_`, `ledger_`, `evt_`).
4. Permit and webhook signatures are explicit fixture markers, not usable production secrets.
5. A successful model/tool fixture has exactly one operation, one attempt, one report and one ledger capture.
6. A negative fixture must assert both user-facing state and supplier/ledger side effects.
7. Fixtures describe protocol semantics only; they do not prove a live Payload, ChatNest or Porta deployment.

## Loading rules

- ChatNest contract tests load fixtures through JSON parse + runtime schema validation.
- Payload tests replay webhook fixtures through the inbox service and assert idempotency/ledger state.
- Porta tests use tool-success permit/receipt fields to assert required mode, signature and supplier call count.
- E2E tests may copy fixture IDs into a test namespace, but must not modify these canonical files.
- Any field change requires updating `openapi.yaml`, JSON Schema, fixture README and all three repository contract tests in the same change.

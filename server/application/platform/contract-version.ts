/** Generated from docs/contracts/platform-points/source.json + manifest.json. */
export const PLATFORM_API_VERSION = "v1" as const;
export const PLATFORM_SCHEMA_REVISION = "2026-11-05.16" as const;
export const PLATFORM_POINT_SCALE = 1_000_000 as const;
export const PLATFORM_REQUEST_ID_MAX_LENGTH = 128 as const;
export const PLATFORM_CONTRACT_SCHEMA_FILES = [
  "operation.json",
  "payment-event.json",
  "permit.json",
  "receipt.json",
] as const;
export const PLATFORM_CONTRACT_FIXTURE_FILES = [
  "canonical-json-vectors.json",
  "model-success.json",
  "negative-cases.json",
  "payment-completed.json",
  "payment-refund.json",
  "state-transitions.json",
  "tool-success.json",
] as const;

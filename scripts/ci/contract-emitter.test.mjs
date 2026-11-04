import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { DATE_TIME_PATTERN, emitType, emitZod } from "./contract-emitter.mjs";

const runtime = (schema, defs = {}) =>
  new Function("z", `return ${emitZod(schema, defs)}`)(z);

test("schema compiler preserves strict required, nullable, Unicode lengths and map limits", () => {
  const schema = runtime({
    additionalProperties: false,
    properties: {
      amount: {
        pattern: "^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,6})?$",
        type: "string",
      },
      units: {
        additionalProperties: { maxLength: 3, type: "string" },
        propertyNames: { maxLength: 2, type: "string" },
        type: "object",
      },
      value: { maxLength: 1, type: ["string", "null"] },
    },
    required: ["amount", "value"],
    type: "object",
  });
  for (const value of [
    { amount: "2.000000", value: null },
    { amount: "0", units: { a: "123" }, value: "😀" },
  ]) {
    assert.equal(schema.safeParse(value).success, true);
  }
  for (const value of [
    { amount: "1" },
    { amount: "1.0000001", value: null },
    { amount: "1", extra: true, value: null },
    { amount: "1", value: "xx" },
    { amount: "1", units: { long: "x" }, value: null },
  ]) {
    assert.equal(schema.safeParse(value).success, false);
  }
});

test("unsupported schema keywords and references fail generation", () => {
  assert.throws(
    () =>
      emitZod({ items: { type: "string" }, type: "array", uniqueItems: true }),
    /UNSUPPORTED/
  );
  assert.throws(
    () => emitZod({ $ref: "https://unknown.test/schema" }),
    /REFERENCE/
  );
  assert.throws(() => emitZod({ format: "made-up", type: "string" }), /FORMAT/);
  assert.throws(
    () => emitZod({ $ref: "#/$defs/Loop" }, { Loop: { $ref: "#/$defs/Loop" } }),
    /CYCLE/
  );
});

test("oneOf rejects ambiguous matches instead of behaving like anyOf", () => {
  const schema = runtime({ oneOf: [{ type: "number" }, { type: "integer" }] });
  assert.equal(schema.safeParse(1.5).success, true);
  assert.equal(schema.safeParse(1).success, false);
});

test("generated types and validators resolve the same definition", () => {
  const defs = { Name: { enum: ["model", "tool"], type: "string" } };
  assert.equal(
    runtime({ $ref: "#/$defs/Name" }, defs).safeParse("forged").success,
    false
  );
  assert.equal(emitType({ $ref: "#/$defs/Name" }, defs), '"model" | "tool"');
});

test("unsupported constraint intersections fail instead of silently weakening validation", () => {
  for (const schema of [
    { const: "a", enum: ["a", "b"], type: "string" },
    { enum: ["a", "bb"], maxLength: 1 },
    {
      anyOf: [{ type: "null" }, { type: "boolean" }],
      oneOf: [{ type: "string" }, { type: "number" }],
    },
  ]) {
    assert.throws(() => emitZod(schema), /UNSUPPORTED/);
  }
});

test("integer follows JSON integer semantics, not implicit safe-integer bounds", () => {
  assert.equal(runtime({ type: "integer" }).safeParse(1e20).success, true);
});

test("complex literals and local definition scopes fail closed", () => {
  assert.throws(
    () => emitZod({ const: { a: 1 }, type: "object" }),
    /UNSUPPORTED/
  );
  assert.throws(
    () =>
      emitZod(
        {
          $defs: { Value: { maxLength: 1, type: "string" } },
          properties: { field: { $ref: "#/$defs/Value" } },
          type: "object",
        },
        { Value: { type: "string" } }
      ),
    /UNSUPPORTED/
  );
});

test("standard date format validates calendar dates without normalizing invalid input", () => {
  const validate = runtime({
    format: "date",
    pattern: "^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])$",
    type: "string",
  });
  for (const value of ["2024-02-29", "2000-02-29", "2026-11-02"]) {
    assert.equal(validate.safeParse(value).success, true);
  }
  for (const value of [
    "2025-02-29",
    "1900-02-29",
    "2026-02-31",
    "2026-04-31",
    "2026-11-2",
    " 2026-11-02",
    "2026-11-02T00:00:00Z",
  ]) {
    assert.equal(validate.safeParse(value).success, false);
  }
});

test("millisecond date-time profile rejects precision loss without changing general timestamp contracts", () => {
  const pattern = DATE_TIME_PATTERN.replace(
    String.raw`\d+`,
    String.raw`\d{1,3}`
  );
  const schema = runtime({ format: "date-time", pattern, type: "string" });
  for (const value of [
    "2026-11-02T00:00:00Z",
    "2026-11-02T00:00:00.1Z",
    "2026-11-02T00:00:00.123+01:00",
  ]) {
    assert.equal(schema.safeParse(value).success, true);
  }
  for (const value of [
    "2026-11-02T00:00:00.0009Z",
    "2026-11-02T00:00:00.123456Z",
  ]) {
    assert.equal(schema.safeParse(value).success, false);
  }
  assert.equal(
    runtime({
      format: "date-time",
      pattern: DATE_TIME_PATTERN,
      type: "string",
    }).safeParse("2026-11-02T00:00:00.123456Z").success,
    true
  );
});

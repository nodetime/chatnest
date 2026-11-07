import assert from "node:assert/strict";
import { test } from "node:test";
import { pointStringSchema } from "@/server/application/platform/points";

test("platform points accept fixed-point strings up to six decimals", () => {
  assert.equal(pointStringSchema.parse("0"), "0");
  assert.equal(pointStringSchema.parse("12"), "12");
  assert.equal(pointStringSchema.parse("12.345678"), "12.345678");
});

test("platform points reject floating-point ambiguity and over-precision", () => {
  for (const value of ["01", "1.", ".5", "-1", "1.1234567", 1.5]) {
    assert.throws(() => pointStringSchema.parse(value));
  }
});

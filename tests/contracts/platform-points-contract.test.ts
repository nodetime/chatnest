import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../../docs/contracts/platform-points/", import.meta.url);

test("platform points contract contains every v1 operation and strict operation schema", async () => {
  const openapi = await readFile(new URL("openapi.yaml", root), "utf8");
  const schema = JSON.parse(
    await readFile(new URL("schemas/operation.json", root), "utf8")
  ) as { additionalProperties: boolean; required: string[] };
  for (const path of [
    "/capabilities",
    "/identity/login",
    "/me/access",
    "/me/wallet",
    "/operations/reserve",
    "/operations/{operationId}/dispatch",
    "/operations/{operationId}/report",
    "/operations/{operationId}/cancel",
    "/internal/v1/receipts/{attemptId}",
  ]) {
    assert.match(
      openapi,
      new RegExp(path.replaceAll("{", "\\{").replaceAll("}", "\\}"))
    );
  }
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    "operationId",
    "attemptId",
    "state",
    "priceVersion",
    "reservedPoints",
  ]);
});

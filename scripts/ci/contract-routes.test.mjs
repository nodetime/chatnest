import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
import { z } from "zod";
import { renderRoutes, renderWire } from "./contract-routes.mjs";

const source = {
  definitions: {
    ItemResponse: {
      additionalProperties: false,
      properties: {},
      required: [],
      type: "object",
    },
  },
  openapi: {
    paths: {
      "/items": {
        post: {
          operationId: "createItem",
          responses: {
            201: {
              content: {
                "application/json": {
                  schema: { $ref: "#/$defs/ItemResponse" },
                },
              },
            },
          },
          "x-runtime": {
            auth: "user",
            handler: "createItem",
            order: 1,
            owner: "billing",
          },
        },
      },
      "/items/{itemId}": {
        get: {
          operationId: "readItem",
          parameters: [
            {
              in: "path",
              name: "itemId",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { $ref: "#/$defs/ItemResponse" },
                },
              },
            },
          },
          "x-runtime": {
            auth: "user",
            handler: "readItem",
            order: 0,
            owner: "billing",
          },
        },
      },
    },
  },
  runtimeOwners: { billing: { pathPrefix: "/platform/v1" } },
};
function runtime(value) {
  const compiled = ts.transpileModule(renderRoutes(value), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  new Function("exports", compiled)(exports);
  return exports;
}
test("registry is generated from operation owners and preserves concrete method/path/handler order", () => {
  const mod = runtime(source);
  const readItem = () => "read";
  const createItem = () => "create";
  assert.deepEqual(
    mod.bindPlatformHandlers("billing", { createItem, readItem }),
    [
      { handler: readItem, method: "get", path: "/platform/v1/items/:itemId" },
      { handler: createItem, method: "post", path: "/platform/v1/items" },
    ]
  );
});
test("binding fails closed on missing or extra handler instead of dropping a route", () => {
  const mod = runtime(source);
  assert.throws(
    () => mod.bindPlatformHandlers("billing", { readItem: () => 0 }),
    /HANDLER_COVERAGE/
  );
  assert.throws(
    () =>
      mod.bindPlatformHandlers("billing", {
        createItem: () => 0,
        extra: () => 0,
        readItem: () => 0,
      }),
    /HANDLER_COVERAGE/
  );
  assert.throws(() => mod.bindPlatformHandlers("absent", {}), /UNKNOWN_OWNER/);
});
test("unknown owner, duplicate IDs/order, missing template parameters fail generation", () => {
  for (const mutate of [
    (s) => {
      s.openapi.paths["/items"].post["x-runtime"].owner = "missing";
    },
    (s) => {
      s.openapi.paths["/items"].post.operationId = "readItem";
    },
    (s) => {
      s.openapi.paths["/items"].post["x-runtime"].order = 0;
    },
    (s) => {
      s.openapi.paths["/items/{itemId}"].get.parameters = [];
    },
  ]) {
    const next = structuredClone(source);
    mutate(next);
    assert.throws(() => renderRoutes(next), /CONTRACT_ROUTE/);
  }
});

test("runtime route collisions across owners and undeclared wire references fail generation", () => {
  const collision = structuredClone(source);
  collision.runtimeOwners.other = { pathPrefix: "/platform/v1" };
  const other = structuredClone(collision.openapi.paths["/items/{itemId}"].get);
  other.operationId = "otherRead";
  other["x-runtime"] = {
    auth: "service",
    handler: "otherRead",
    order: 0,
    owner: "other",
  };
  other.parameters[0].name = "otherId";
  collision.openapi.paths["/items/{otherId}"] = { get: other };
  assert.throws(() => renderRoutes(collision), /CONTRACT_ROUTE_COLLISION/);
  const missing = structuredClone(source);
  missing.openapi.paths["/items"].post.responses["201"].content[
    "application/json"
  ].schema.$ref = "#/$defs/Missing";
  assert.throws(() => renderRoutes(missing), /RESPONSE_SCHEMA/);
});

test("request-body routes require and generate an explicit transport byte budget", () => {
  const value = structuredClone(source);
  value.openapi.paths["/items"].post.requestBody = {
    content: {
      "application/json": { schema: { $ref: "#/$defs/ItemResponse" } },
    },
    required: true,
  };
  assert.throws(() => runtime(value), /CONTRACT_ROUTE_BODY_LIMIT/);
  for (const limit of [0, -1, 1.5, "1024", Number.MAX_SAFE_INTEGER + 1]) {
    value.openapi.paths["/items"].post["x-max-body-bytes"] = limit;
    assert.throws(() => runtime(value), /CONTRACT_ROUTE_BODY_LIMIT/);
  }
  value.openapi.paths["/items"].post["x-max-body-bytes"] = 65_536;
  assert.throws(() => runtime(value), /CONTRACT_ROUTE_BODY_LIMIT_RESPONSE/);
  value.openapi.paths["/items"].post.responses[413] = structuredClone(
    value.openapi.paths["/items"].post.responses[201]
  );
  assert.equal(runtime(value).platformRoute("createItem").maxBodyBytes, 65_536);
  assert.equal(runtime(value).platformRoute("readItem").maxBodyBytes, null);
});

function wireRuntime(value) {
  const compiled = ts.transpileModule(renderWire(value), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (name === "zod") {
      return { z };
    }
    if (name === "./routes.js") {
      return runtime(value);
    }
    return { ItemResponseSchema: z.object({}).strict() };
  }, exports);
  return exports;
}

test("generated parameter schemas preserve wire strings and constrain integer syntax without defaults", () => {
  const value = structuredClone(source);
  value.openapi.paths["/items/{itemId}"].get.parameters.push(
    {
      in: "query",
      name: "limit",
      schema: { default: 20, maximum: 100, minimum: 1, type: "integer" },
    },
    {
      in: "query",
      name: "state",
      schema: { enum: ["settled", "released"], type: "string" },
    },
    {
      in: "header",
      name: "If-Match",
      required: true,
      schema: { minLength: 1, type: "string" },
    }
  );
  const mod = wireRuntime(value);
  assert.deepEqual(mod.platformQuerySchema("readItem").parse({}), {});
  assert.deepEqual(
    mod
      .platformQuerySchema("readItem")
      .parse({ limit: "100", state: "settled" }),
    { limit: 100, state: "settled" }
  );
  for (const limit of ["0", "101", "01", "+1", "1e2", "1.0", " 1", "", 1]) {
    assert.equal(
      mod.platformQuerySchema("readItem").safeParse({ limit }).success,
      false
    );
  }
  assert.equal(
    mod.platformQuerySchema("readItem").safeParse({ state: "legacy" }).success,
    false
  );
  assert.equal(
    mod.platformQuerySchema("readItem").safeParse({ unknown: "x" }).success,
    false
  );
  assert.equal(mod.platformPathSchema("readItem").safeParse({}).success, false);
  assert.deepEqual(
    mod.platformPathSchema("readItem").parse({ itemId: "007" }),
    { itemId: "007" }
  );
  assert.equal(
    mod.platformHeaderSchema("readItem").safeParse({}).success,
    false
  );
  assert.deepEqual(
    mod.platformHeaderSchema("readItem").parse({ "if-match": "revision" }),
    { "if-match": "revision" }
  );
});

test("parameter generation follows canonical mutations and rejects unsupported or ambiguous declarations", () => {
  for (const mutate of [
    (pars) => pars.push({ ...pars[0] }),
    (pars) =>
      pars.push({ in: "cookie", name: "sid", schema: { type: "string" } }),
    (pars) =>
      pars.push({ in: "query", name: "filter", schema: { type: "object" } }),
  ]) {
    const value = structuredClone(source);
    mutate(value.openapi.paths["/items/{itemId}"].get.parameters);
    assert.throws(() => renderWire(value), /CONTRACT_ROUTE_PARAMETER/);
  }
  const value = structuredClone(source);
  value.openapi.paths["/items/{itemId}"].get.parameters[0].schema.maxLength = 2;
  assert.equal(
    wireRuntime(value)
      .platformPathSchema("readItem")
      .safeParse({ itemId: "abc" }).success,
    false
  );
});

test("string union parameter references stay strings and follow calendar constraints", () => {
  const value = structuredClone(source);
  value.definitions.DateFilter = {
    anyOf: [
      {
        format: "date",
        pattern: "^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])$",
        type: "string",
      },
      { enum: ["fixture"], type: "string" },
    ],
  };
  value.openapi.paths["/items/{itemId}"].get.parameters.push({
    in: "query",
    name: "from",
    schema: { $ref: "#/$defs/DateFilter" },
  });
  const validate = wireRuntime(value).platformQuerySchema("readItem");
  assert.deepEqual(validate.parse({ from: "2024-02-29" }), {
    from: "2024-02-29",
  });
  assert.equal(validate.safeParse({ from: "2026-02-31" }).success, false);
});

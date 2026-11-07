import { emitZod } from "./contract-emitter.mjs";

const methods = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);
const identifier = /^[a-zA-Z][a-zA-Z0-9]*$/;
const ownersPattern = /^[a-z][a-z0-9-]*$/;
const authModes = new Set([
  "user",
  "service",
  "internal",
  "mapped-reader",
  "mapped-admin",
  "staff-reader",
  "staff-or-mapped-admin",
  "provider-signature",
  "reconcile-token",
]);
function parameterKind(schema, definitions, seen = []) {
  if (schema?.$ref) {
    const prefix = "#/$defs/";
    const name = schema.$ref.startsWith(prefix)
      ? schema.$ref.slice(prefix.length)
      : null;
    if (!name || seen.includes(name) || !definitions[name]) {
      throw new Error("CONTRACT_ROUTE_PARAMETER_REFERENCE");
    }
    return parameterKind(definitions[name], definitions, [...seen, name]);
  }
  if (["string", "integer"].includes(schema?.type)) {
    return schema.type;
  }
  if (
    schema?.anyOf?.length >= 2 &&
    schema.anyOf.every(
      (item) => parameterKind(item, definitions, seen) === "string"
    )
  ) {
    return "string";
  }
  throw new Error("CONTRACT_ROUTE_PARAMETER_SCHEMA");
}
export function routeDescriptors(source) {
  const owners = source.runtimeOwners;
  if (!owners || !Object.keys(owners).length) {
    throw new Error("CONTRACT_ROUTE_OWNERS_MISSING");
  }
  for (const [owner, configuration] of Object.entries(owners)) {
    if (
      !ownersPattern.test(owner) ||
      typeof configuration.pathPrefix !== "string" ||
      (configuration.pathPrefix !== "" &&
        !/^\/[A-Za-z0-9/-]+$/.test(configuration.pathPrefix))
    ) {
      throw new Error("CONTRACT_ROUTE_OWNER_INVALID");
    }
  }
  const routes = [];
  const runtimeKeys = new Set();
  const ids = new Set();
  const orders = new Set();
  const handlers = new Set();
  for (const [path, item] of Object.entries(source.openapi.paths)) {
    if (!/^\/[A-Za-z0-9/{}_-]+$/.test(path)) {
      throw new Error("CONTRACT_ROUTE_PATH_INVALID");
    }
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method)) {
        if (
          !["servers", "parameters", "summary", "description"].includes(method)
        ) {
          throw new Error("CONTRACT_ROUTE_METHOD_INVALID");
        }
        continue;
      }
      const id = operation.operationId;
      const metadata = operation["x-runtime"];
      if (
        !identifier.test(id ?? "") ||
        ids.has(id) ||
        !metadata ||
        !Object.hasOwn(owners, metadata.owner) ||
        !identifier.test(metadata.handler ?? "") ||
        !Number.isSafeInteger(metadata.order) ||
        metadata.order < 0 ||
        !authModes.has(metadata.auth)
      ) {
        throw new Error("CONTRACT_ROUTE_METADATA_INVALID");
      }
      const order = `${metadata.owner}:${metadata.order}`;
      const handler = `${metadata.owner}:${metadata.handler}`;
      if (orders.has(order) || handlers.has(handler)) {
        throw new Error("CONTRACT_ROUTE_DUPLICATE_BINDING");
      }
      ids.add(id);
      orders.add(order);
      handlers.add(handler);
      const parameters = [
        ...(item.parameters ?? []),
        ...(operation.parameters ?? []),
      ].map((parameter) => {
        if (!parameter.$ref) {
          return parameter;
        }
        const prefix = "#/components/parameters/";
        const resolved = parameter.$ref.startsWith(prefix)
          ? source.openapi.components?.parameters?.[
              parameter.$ref.slice(prefix.length)
            ]
          : undefined;
        if (!resolved) {
          throw new Error("CONTRACT_ROUTE_PARAMETER_REFERENCE");
        }
        return resolved;
      });
      const templateNames = [...path.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)]
        .map((match) => match[1])
        .sort((a, b) => a.localeCompare(b));
      const parameterKeys = new Set();
      for (const parameter of parameters) {
        const key = `${parameter.in}:${parameter.in === "header" ? parameter.name?.toLowerCase() : parameter.name}`;
        if (
          !["query", "path", "header"].includes(parameter.in) ||
          !/^[A-Za-z][A-Za-z0-9_-]*$/.test(parameter.name ?? "") ||
          parameterKeys.has(key) ||
          !parameterKind(parameter.schema, source.definitions)
        ) {
          throw new Error("CONTRACT_ROUTE_PARAMETER_INVALID");
        }
        parameterKeys.add(key);
      }
      const declared = parameters.filter(
        (parameter) => parameter.in === "path"
      );
      if (
        declared.some((parameter) => parameter.required !== true) ||
        JSON.stringify(templateNames) !==
          JSON.stringify(
            declared
              .map((parameter) => parameter.name)
              .sort((a, b) => a.localeCompare(b))
          )
      ) {
        throw new Error("CONTRACT_ROUTE_PATH_PARAMETERS");
      }
      const runtimePath =
        owners[metadata.owner].pathPrefix +
        path.replaceAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g, ":$1");
      if (/[{}]/.test(runtimePath)) {
        throw new Error("CONTRACT_ROUTE_PATH_INVALID");
      }
      const runtimeKey = `${method} ${runtimePath.replaceAll(/:[A-Za-z][A-Za-z0-9]*/g, ":parameter")}`;
      if (runtimeKeys.has(runtimeKey)) {
        throw new Error("CONTRACT_ROUTE_COLLISION");
      }
      runtimeKeys.add(runtimeKey);
      const responses = {};
      for (const [status, response] of Object.entries(
        operation.responses ?? {}
      )) {
        const ref = response.content?.["application/json"]?.schema?.$ref;
        const name = ref?.startsWith("#/$defs/") ? ref.slice(8) : undefined;
        if (
          !/^[1-5][0-9]{2}$/.test(status) ||
          !name ||
          !Object.hasOwn(source.definitions ?? {}, name)
        ) {
          throw new Error("CONTRACT_ROUTE_RESPONSE_SCHEMA");
        }
        responses[status] = name;
      }
      if (!Object.keys(responses).some((status) => status.startsWith("2"))) {
        throw new Error("CONTRACT_ROUTE_SUCCESS_REQUIRED");
      }
      const bodyRef =
        operation.requestBody?.content?.["application/json"]?.schema?.$ref;
      const bodySchema = bodyRef?.startsWith("#/$defs/")
        ? bodyRef.slice(8)
        : null;
      if (
        operation.requestBody &&
        (!bodySchema || !Object.hasOwn(source.definitions ?? {}, bodySchema))
      ) {
        throw new Error("CONTRACT_ROUTE_BODY_SCHEMA");
      }
      const maxBodyBytes = bodySchema ? operation["x-max-body-bytes"] : null;
      if (
        bodySchema &&
        (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1)
      ) {
        throw new Error("CONTRACT_ROUTE_BODY_LIMIT");
      }
      if (bodySchema && !Object.hasOwn(responses, "413")) {
        throw new Error("CONTRACT_ROUTE_BODY_LIMIT_RESPONSE");
      }
      routes.push({
        auth: metadata.auth,
        bodyRequired: operation.requestBody?.required === true,
        bodySchema,
        handler: metadata.handler,
        id,
        maxBodyBytes,
        method,
        order: metadata.order,
        owner: metadata.owner,
        parameters: parameters.map(
          ({ name, in: location, required, schema }) => ({
            in: location,
            name: location === "header" ? name.toLowerCase() : name,
            required: required === true,
            schema,
          })
        ),
        path: runtimePath,
        responses,
      });
    }
  }
  for (const owner of Object.keys(owners)) {
    if (!routes.some((route) => route.owner === owner)) {
      throw new Error("CONTRACT_ROUTE_EMPTY_OWNER");
    }
  }
  return routes.sort(
    (a, b) => a.owner.localeCompare(b.owner) || a.order - b.order
  );
}
export function renderRoutes(source) {
  const routes = routeDescriptors(source);
  return `/** Generated from platform-points/source.json. Auth metadata describes existing handler policy; binding does not replace authorization. */
export const platformRoutes = ${JSON.stringify(routes)} as const;
type Route = typeof platformRoutes[number];
export type PlatformRouteOwner = Route["owner"];
export function platformRoute<I extends Route["id"]>(id: I): Extract<Route, { id: I }> {
  const route = platformRoutes.find(item => item.id === id);
  if (!route) throw new Error("CONTRACT_ROUTE_UNKNOWN_ID");
  return route as Extract<Route, { id: I }>;
}
export type PlatformHandlerName<O extends PlatformRouteOwner> = Extract<Route, { owner: O }>["handler"];
export function bindPlatformHandlers<O extends PlatformRouteOwner, H>(owner: O, handlers: Record<PlatformHandlerName<O>, H>) {
  const routes = platformRoutes.filter(route => route.owner === owner);
  if (!routes.length) throw new Error("CONTRACT_ROUTE_UNKNOWN_OWNER");
  const expected = routes.map(route => route.handler).sort((a, b) => a.localeCompare(b));
  const actual = Object.keys(handlers).sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(expected) !== JSON.stringify(actual) || actual.some(key => typeof handlers[key as PlatformHandlerName<O>] !== "function")) throw new Error("CONTRACT_ROUTE_HANDLER_COVERAGE");
  return routes.map(route => ({ path: route.path, method: route.method, handler: handlers[route.handler as PlatformHandlerName<O>] }));
}
`;
}

export function renderWire(source) {
  const routes = routeDescriptors(source);
  const names = [
    ...new Set(
      routes.flatMap((route) => [
        ...Object.values(route.responses),
        ...(route.bodySchema ? [route.bodySchema] : []),
      ])
    ),
  ].sort((a, b) => a.localeCompare(b));
  const parameterValidators = ["query", "path", "header"]
    .map((location) => {
      const entries = routes.map((route) => {
        const fields = route.parameters
          .filter((parameter) => parameter.in === location)
          .map((parameter) => {
            // OpenAPI default describes business policy; it must not fill absent wire input.
            const schema = Object.fromEntries(
              Object.entries(parameter.schema).filter(
                ([key]) => key !== "default"
              )
            );
            const value = emitZod(schema, source.definitions);
            const wire =
              parameterKind(schema, source.definitions) === "integer"
                ? `z.string().regex(/^(?:0|-?[1-9][0-9]*)$/).transform(Number).pipe(${value})`
                : value;
            return `${JSON.stringify(parameter.name)}: ${wire}${parameter.required ? "" : ".optional()"}`;
          });
        return `${JSON.stringify(route.id)}: z.object({${fields.join(",")}}).strict()`;
      });
      const title = location[0].toUpperCase() + location.slice(1);
      return `const ${location}Validators = {${entries.join(",")}} as const;
export function platform${title}Schema<I extends OperationId>(id: I): typeof ${location}Validators[I] {
  return ${location}Validators[id];
}`;
    })
    .join("\n");
  return `/** Generated operation-to-validator lookup. No authorization or side effects. */
import { z } from "zod";
import { platformRoute } from "./routes.js";
import { ${names.map((name) => `${name}Schema`).join(", ")} } from "./schemas.js";
const validators: Record<string, z.ZodType> = { ${names.map((name) => `${name}: ${name}Schema`).join(", ")} };
type OperationId = Parameters<typeof platformRoute>[0];
${parameterValidators}
export function platformBodySchema(id: OperationId): z.ZodType | null {
  const route = platformRoute(id);
  return route.bodySchema ? validators[route.bodySchema] : null;
}
export function platformResponseSchema(id: OperationId, status: number): z.ZodType {
  const route = platformRoute(id);
  const responses: Readonly<Record<string, string>> = route.responses;
  const name = responses[String(status)];
  if (!name || !validators[name]) throw new Error("CONTRACT_UNDECLARED_RESPONSE_STATUS");
  return validators[name];
}
`;
}

// RFC3339 subset used on the wire: uppercase T/Z, seconds required, no leap seconds.
export const DATE_TIME_PATTERN =
  "^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$";
export const DATE_TIME_MILLISECOND_PATTERN = DATE_TIME_PATTERN.replace(
  String.raw`\d+`,
  String.raw`\d{1,3}`
);
export const DATE_PATTERN =
  "^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])$";
// Deliberately bounded JSON Schema compiler. Unsupported constraints fail closed.
const keywords = new Set([
  "$ref",
  "title",
  "description",
  "type",
  "enum",
  "const",
  "properties",
  "required",
  "additionalProperties",
  "propertyNames",
  "items",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "oneOf",
  "anyOf",
]);

function check(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("UNSUPPORTED_SCHEMA");
  }
  const literals =
    schema.enum ?? (schema.const === undefined ? [] : [schema.const]);
  if (literals.some((item) => item !== null && typeof item === "object")) {
    throw new Error("UNSUPPORTED_COMPLEX_LITERAL");
  }
  if (schema.enum && schema.const !== undefined) {
    throw new Error("UNSUPPORTED_ENUM_CONST_INTERSECTION");
  }
  if (schema.oneOf && schema.anyOf) {
    throw new Error("UNSUPPORTED_UNION_INTERSECTION");
  }
  if (
    !schema.type &&
    (schema.enum || schema.const !== undefined) &&
    Object.keys(schema).some(
      (key) => !["enum", "const", "description", "title"].includes(key)
    )
  ) {
    throw new Error("UNSUPPORTED_UNTYPED_CONSTRAINTS");
  }
  for (const key of Object.keys(schema)) {
    if (!keywords.has(key)) {
      throw new Error(`UNSUPPORTED_KEYWORD:${key}`);
    }
  }
}

function reference(schema, definitions, stack) {
  const name = schema.$ref?.replace(/^#\/\$defs\//, "");
  if (!schema.$ref?.startsWith("#/$defs/") || !definitions[name]) {
    throw new Error(`UNKNOWN_REFERENCE:${schema.$ref}`);
  }
  if (stack.includes(name)) {
    throw new Error(`REFERENCE_CYCLE:${name}`);
  }
  if (
    Object.keys(schema).some(
      (key) => !["$ref", "description", "title"].includes(key)
    )
  ) {
    throw new Error("UNSUPPORTED_REF_SIBLINGS");
  }
  return [definitions[name], [...stack, name]];
}

export function emitZod(schema, definitions = {}, stack = [], depth = 0) {
  check(schema);
  const child = (definition) =>
    emitZod(definition, definitions, stack, depth + 1);
  if (schema.$ref) {
    const [value, next] = reference(schema, definitions, stack);
    return emitZod(value, definitions, next, depth + 1);
  }
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf || schema.anyOf).map(child);
    if (variants.length < 2) {
      throw new Error("UNSUPPORTED_UNION_ARITY");
    }
    if (
      Object.keys(schema).some(
        (key) => !["oneOf", "anyOf", "description", "title"].includes(key)
      )
    ) {
      throw new Error("UNSUPPORTED_UNION_SIBLINGS");
    }
    const union = `z.union([${variants.join(", ")}])`;
    return schema.oneOf
      ? `${union}.refine(value${depth} => [${variants.join(", ")}].filter(validator => validator.safeParse(value${depth}).success).length === 1)`
      : union;
  }
  if (Array.isArray(schema.type)) {
    return `z.union([${schema.type.map((type) => child({ ...schema, type })).join(", ")}])`;
  }
  let value;
  switch (schema.type) {
    case "null":
      value = "z.null()";
      break;
    case "boolean":
      value = "z.boolean()";
      break;
    case "string": {
      value = "z.string()";
      for (const [key, comparison] of [
        ["minLength", ">="],
        ["maxLength", "<="],
      ]) {
        if (schema[key] !== undefined) {
          value += `.refine(value${depth} => [...value${depth}].length ${comparison} ${schema[key]})`;
        }
      }
      if (schema.pattern !== undefined) {
        const pattern = new RegExp(schema.pattern, "u");
        // A canonical NUL-denial pattern intentionally names a control codepoint.
        // Annotate only that emitted expression; never weaken its validation or disable the rule globally.
        const nulGuard =
          pattern.source.includes("\\u0000") ||
          pattern.source.includes("\\x00") ||
          pattern.source.includes("\0");
        const annotation = nulGuard
          ? "\n// biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.\n"
          : "";
        value += `.regex(${annotation}new RegExp(${JSON.stringify(pattern.source)}, "u"))`;
      }
      if (schema.format === "date-time") {
        if (
          schema.pattern !== DATE_TIME_PATTERN &&
          schema.pattern !== DATE_TIME_MILLISECOND_PATTERN
        ) {
          throw new Error("UNSUPPORTED_DATE_TIME_PROFILE");
        }
        value += ".datetime({ offset: true })";
      } else if (schema.format === "date") {
        if (schema.pattern !== DATE_PATTERN) {
          throw new Error("UNSUPPORTED_DATE_PROFILE");
        }
        value += ".date()";
      } else if (schema.format) {
        throw new Error(`UNSUPPORTED_FORMAT:${schema.format}`);
      }
      break;
    }
    case "number":
    case "integer": {
      value =
        schema.type === "integer"
          ? "z.number().refine(Number.isInteger)"
          : "z.number()";
      if (schema.minimum !== undefined) {
        value += `.min(${schema.minimum})`;
      }
      if (schema.maximum !== undefined) {
        value += `.max(${schema.maximum})`;
      }
      break;
    }
    case "array": {
      if (!schema.items) {
        throw new Error("ARRAY_ITEMS_REQUIRED");
      }
      value = `z.array(${child(schema.items)})`;
      if (schema.minItems !== undefined) {
        value += `.min(${schema.minItems})`;
      }
      if (schema.maxItems !== undefined) {
        value += `.max(${schema.maxItems})`;
      }
      break;
    }
    case "object": {
      const properties = schema.properties ?? {};
      for (const name of schema.required ?? []) {
        if (!(name in properties)) {
          throw new Error(`REQUIRED_PROPERTY_UNDECLARED:${name}`);
        }
      }
      if (
        !schema.properties &&
        typeof schema.additionalProperties === "object"
      ) {
        value = `z.record(${schema.propertyNames ? child(schema.propertyNames) : "z.string()"}, ${child(schema.additionalProperties)})`;
      } else {
        const fields = Object.entries(properties).map(
          ([name, definition]) =>
            `${JSON.stringify(name)}: ${child(definition)}${schema.required?.includes(name) ? "" : ".optional()"}`
        );
        value = `z.object({${fields.join(", ")}})`;
        if (schema.additionalProperties === false) {
          value += ".strict()";
        } else if (typeof schema.additionalProperties === "object") {
          value += `.catchall(${child(schema.additionalProperties)})`;
        } else {
          value += ".passthrough()";
        }
        if (schema.propertyNames) {
          value += `.refine(value${depth} => Object.keys(value${depth}).every(key => ${child(schema.propertyNames)}.safeParse(key).success))`;
        }
      }
      break;
    }
    case undefined: {
      if (schema.const === undefined && !schema.enum) {
        throw new Error("UNSUPPORTED_UNTYPED_SCHEMA");
      }
      value = "z.unknown()";
      break;
    }
    default:
      throw new Error(`UNSUPPORTED_TYPE:${schema.type}`);
  }
  const choices =
    schema.enum ?? (schema.const === undefined ? undefined : [schema.const]);
  if (choices) {
    if (!choices.length) {
      throw new Error("EMPTY_ENUM");
    }
    const literals = choices.map(
      (item) => `z.literal(${JSON.stringify(item)})`
    );
    const constraint =
      literals.length === 1 ? literals[0] : `z.union([${literals.join(", ")}])`;
    value = schema.type
      ? `z.intersection(${value}, ${constraint})`
      : constraint;
  }
  return value;
}

export function emitType(schema, definitions = {}, stack = []) {
  // Validate with the same fail-closed keyword policy before producing type declarations.
  emitZod(schema, definitions, stack);
  const child = (value) => emitType(value, definitions, stack);
  if (schema.$ref) {
    const [value, next] = reference(schema, definitions, stack);
    return emitType(value, definitions, next);
  }
  if (schema.enum) {
    return schema.enum.map((item) => JSON.stringify(item)).join(" | ");
  }
  if (schema.const !== undefined) {
    return JSON.stringify(schema.const);
  }
  if (schema.oneOf || schema.anyOf) {
    return (schema.oneOf || schema.anyOf)
      .map((item) => `(${child(item)})`)
      .join(" | ");
  }
  if (Array.isArray(schema.type)) {
    return schema.type
      .map((type) => `(${child({ ...schema, type })})`)
      .join(" | ");
  }
  if (schema.type === "integer" || schema.type === "number") {
    return "number";
  }
  if (["string", "boolean", "null"].includes(schema.type)) {
    return schema.type;
  }
  if (schema.type === "array") {
    return `(${child(schema.items)})[]`;
  }
  const fields = Object.entries(schema.properties ?? {}).map(
    ([name, definition]) =>
      `${JSON.stringify(name)}${schema.required?.includes(name) ? "" : "?"}: ${child(definition)}`
  );
  if (schema.additionalProperties !== false) {
    fields.push(
      `[key: string]: ${typeof schema.additionalProperties === "object" ? child(schema.additionalProperties) : "unknown"}`
    );
  }
  return `{ ${fields.join("; ")} }`;
}

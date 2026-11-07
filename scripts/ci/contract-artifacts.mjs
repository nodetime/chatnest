import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import { stringify } from "yaml";
import { emitType, emitZod } from "./contract-emitter.mjs";
import { renderRoutes, renderWire } from "./contract-routes.mjs";

function referencedDefinitions(schema, definitions) {
  const found = {};
  function visit(value) {
    if (!value || typeof value !== "object") {
      return;
    }
    if (value.$ref) {
      const name = value.$ref.replace(/^#\/\$defs\//, "");
      if (!definitions[name]) {
        throw new Error(`UNKNOWN_REFERENCE:${value.$ref}`);
      }
      if (!(name in found)) {
        found[name] = definitions[name];
        visit(definitions[name]);
      }
    }
    for (const child of Object.values(value)) {
      visit(child);
    }
  }
  visit(schema);
  return Object.keys(found).length ? { $defs: found } : {};
}

export function renderContract(source, manifest) {
  const definitions = structuredClone(source.definitions);
  const metaValidator = new Ajv2020();
  if (!metaValidator.validateSchema({ $defs: definitions })) {
    throw new Error("INVALID_SOURCE_SCHEMA");
  }
  if (
    definitions.ExecutionPermit.properties.protocolVersion.const !==
    manifest.apiVersion
  ) {
    throw new Error("PERMIT_API_VERSION_DRIFT");
  }
  const digest = createHash("sha256")
    .update(JSON.stringify({ manifest, source }))
    .digest("hex");
  const header =
    "/** Generated from platform-points/source.json + manifest.json. Do not edit. */\n";
  const jsonSchemas = {};
  for (const [file, name] of Object.entries(source.publishedSchemas)) {
    if (!definitions[name]) {
      throw new Error(`UNKNOWN_PUBLISHED_SCHEMA:${name}`);
    }
    jsonSchemas[file] = {
      $id: `platform-points/${file.replace(/\.json$/, "")}`,
      $schema: "https://json-schema.org/draft/2020-12/schema",
      ...definitions[name],
      ...referencedDefinitions(definitions[name], definitions),
    };
  }
  let validators = `${header}import { z } from "zod";\n`;
  let types = header;
  for (const [name, schema] of Object.entries(definitions)) {
    if (!/^[A-Z][A-Za-z0-9]+$/.test(name)) {
      throw new Error(`INVALID_SCHEMA_NAME:${name}`);
    }
    validators += `export const ${name}Schema = ${emitZod(schema, definitions)};\n`;
    types += `export type ${name} = ${emitType(schema, definitions)};\n`;
  }
  let signatures = header;
  for (const [name, entry] of Object.entries(source.signatures)) {
    const schema = definitions[entry.schema];
    if (
      !schema ||
      new Set(entry.fields).size !== entry.fields.length ||
      entry.fields.includes("signature")
    ) {
      throw new Error(`INVALID_SIGNATURE_FIELDS:${name}`);
    }
    for (const field of entry.fields) {
      if (!(field in schema.properties)) {
        throw new Error(`UNDECLARED_SIGNATURE_FIELD:${name}:${field}`);
      }
    }
    signatures += `export const ${name}Fields = ${JSON.stringify(entry.fields)} as const;\n`;
  }
  const openapi = JSON.parse(
    JSON.stringify(source.openapi).replaceAll(
      "#/$defs/",
      "#/components/schemas/"
    )
  );
  openapi.info.version = manifest.apiVersion;
  openapi.info["x-schema-revision"] = manifest.schemaRevision;
  openapi.info["x-point-scale"] = manifest.pointScale;
  openapi.components.schemas = JSON.parse(
    JSON.stringify(definitions).replaceAll("#/$defs/", "#/components/schemas/")
  );
  return {
    bundle: {
      $defs: definitions,
      $schema: "https://json-schema.org/draft/2020-12/schema",
    },
    digest,
    jsonSchemas,
    openapi: `# Generated from source.json + manifest.json. Do not edit.\n${stringify(openapi, { lineWidth: 100 })}`,
    routes: renderRoutes(source),
    signatures,
    types,
    validators,
    wire: renderWire(source),
    workerValidators: `${header}import { z } from "zod";\nexport const PaymentRecoveryWireSchema = ${emitZod(definitions.PaymentReconcileResponse, definitions)};\n`,
  };
}

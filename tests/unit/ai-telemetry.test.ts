import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { OpenTelemetry } from "@ai-sdk/otel";
import { type Tracer, trace } from "@opentelemetry/api";
import { generateText, isStepCount, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import ts from "typescript";
import { z } from "zod";

function modelCalls(
  path: string
): { file: ts.SourceFile; call: ts.CallExpression }[] {
  const calls: { file: ts.SourceFile; call: ts.CallExpression }[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const name = join(path, entry.name);
    if (entry.isDirectory()) {
      calls.push(...modelCalls(name));
    } else if (/\.tsx?$/.test(name)) {
      const file = ts.createSourceFile(
        name,
        readFileSync(name, "utf8"),
        ts.ScriptTarget.Latest,
        true
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          /^(generateText|streamText|generateObject|streamObject)$/.test(
            node.expression.text
          )
        ) {
          calls.push({ call: node, file });
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
  }
  return calls;
}

test("all ten application model calls explicitly use metadata-only telemetry", () => {
  const calls = ["app", "lib", "artifacts"].flatMap(modelCalls);
  assert.equal(calls.length, 10);
  for (const { file, call } of calls) {
    const [options] = call.arguments;
    assert.ok(options && ts.isObjectLiteralExpression(options), file.fileName);
    const setting = options.properties.find(
      (property) =>
        ts.isPropertyAssignment(property) &&
        property.name.getText(file) === "telemetry"
    );
    assert.ok(
      setting && ts.isPropertyAssignment(setting),
      `${file.fileName}: missing telemetry`
    );
    const value = setting.initializer;
    assert.ok(
      (ts.isIdentifier(value) && value.text === "metadataOnlyTelemetry") ||
        (ts.isObjectLiteralExpression(value) &&
          value.properties.some(
            (property) =>
              ts.isSpreadAssignment(property) &&
              property.expression.getText(file) === "metadataOnlyTelemetry"
          ) &&
          !value.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              /^(recordInputs|recordOutputs)$/.test(property.name.getText(file))
          )),
      `${file.fileName}: missing metadata-only settings or overrides content recording`
    );
    assert.match(
      file.text,
      /import\s*\{\s*metadataOnlyTelemetry\s*\}\s*from\s*["'][^"']*telemetry["']/
    );
  }
});

test("installed AI SDK and OTel retain usage but omit private prompt, tool and output content", async () => {
  const implementation = await import("../../lib/ai/telemetry").catch(
    () => null
  );
  assert.ok(
    implementation,
    "shared private-content telemetry policy is missing"
  );
  const { metadataOnlyTelemetry } = implementation;
  assert.deepEqual(metadataOnlyTelemetry, {
    recordInputs: false,
    recordOutputs: false,
  });
  assert.ok(Object.isFrozen(metadataOnlyTelemetry));
  const attributes: unknown[] = [];
  const tracer = {
    startSpan(_name: string, options: { attributes?: unknown } = {}) {
      attributes.push(options.attributes);
      const span = trace.wrapSpanContext({
        spanId: "2".repeat(16),
        traceFlags: 1,
        traceId: "1".repeat(32),
      });
      span.setAttributes = (value) => {
        attributes.push(value);
        return span;
      };
      span.setAttribute = (name, value) => {
        attributes.push({ [name]: value });
        return span;
      };
      return span;
    },
  } as Tracer;
  const usage = {
    inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 10, total: 10 },
    outputTokens: { reasoning: 0, text: 5, total: 5 },
  };
  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              input: JSON.stringify({ query: "PRIVATE_TOOL_INPUT" }),
              toolCallId: "call",
              toolName: "read",
              type: "tool-call",
            },
          ],
          finishReason: { raw: "tool_calls", unified: "tool-calls" },
          usage,
          warnings: [],
        },
        {
          content: [{ text: "PRIVATE_OUTPUT", type: "text" }],
          finishReason: { raw: "stop", unified: "stop" },
          usage,
          warnings: [],
        },
      ],
    }),
    prompt: "PRIVATE_PROMPT_ATTACHMENT_PREVIEW",
    stopWhen: isStepCount(2),
    telemetry: {
      ...metadataOnlyTelemetry,
      integrations: new OpenTelemetry({ tracer }),
    },
    tools: {
      read: tool({
        execute: () => ({ text: "PRIVATE_ATTACHMENT_AND_MCP_RESULT" }),
        inputSchema: z.object({ query: z.string() }),
      }),
    },
  });
  assert.equal(result.text, "PRIVATE_OUTPUT");
  assert.equal(result.steps.length, 2);
  const recorded = JSON.stringify(attributes);
  assert.match(recorded, /gen_ai\.usage\.input_tokens/);
  assert.doesNotMatch(recorded, /PRIVATE_/);
});

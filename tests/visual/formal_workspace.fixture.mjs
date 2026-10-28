// biome-ignore-all lint/style/useFilenamingConvention: Acceptance surface explicitly matches formal_workspace.*.
// Dedicated loopback acceptance fixtures. Never loaded by production code.

import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const metrics = {
  aborted: 0,
  mcpCalls: 0,
  modelCalls: 0,
  requests: [],
  uploadedTextSeen: false,
};
const fixtureDirectory = path.resolve(".local-review/formal");
mkdirSync(fixtureDirectory, { recursive: true });
const logPath = path.join(fixtureDirectory, "events.jsonl");
const record = (event) =>
  appendFileSync(
    logPath,
    `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`
  );
function json(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}
async function body(req) {
  let raw = "";
  for await (const b of req) {
    raw += b;
  }
  return raw ? JSON.parse(raw) : {};
}
const mcpHttp = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    return json(res, { fixtureOnly: true, ...metrics });
  }
  if (req.method !== "POST") {
    return json(
      res,
      {
        error: { code: -32_000, message: "POST required" },
        id: null,
        jsonrpc: "2.0",
      },
      405
    );
  }
  const server = new McpServer({
    name: "Formal acceptance synthetic evidence",
    version: "1.0.0",
  });
  server.registerTool(
    "review_rows",
    {
      description:
        "Return explicitly synthetic local acceptance rows. User approval required.",
      inputSchema: { query: z.string() },
    },
    ({ query }) => {
      metrics.mcpCalls += 1;
      record({ query, type: "mcp-call" });
      const value = {
        fixtureOnly: true,
        rows: [
          {
            evidence: "local-fixture-only",
            name: "FORMAL synthetic Alpha",
            price: 18,
          },
          {
            evidence: "local-fixture-only",
            name: "FORMAL synthetic Beta",
            price: 24,
          },
        ],
      };
      return {
        content: [{ text: JSON.stringify(value), type: "text" }],
        structuredContent: value,
      };
    }
  );
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, await body(req));
  } catch (error) {
    record({ error: String(error), type: "mcp-error" });
    if (!res.headersSent) {
      json(res, { error: "fixture transport failure" }, 500);
    }
  }
});
const modelHttp = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    return json(res, { fixtureOnly: true, ...metrics });
  }
  if (req.url === "/v1/models") {
    return json(res, {
      data: [{ id: "formal-fixture", object: "model", owned_by: "local-test" }],
    });
  }
  if (req.url !== "/v1/chat/completions") {
    return json(res, { error: "fixture endpoint not found" }, 404);
  }
  try {
    const b = await body(req);
    metrics.modelCalls += 1;
    const messages = b.messages ?? [],
      serialized = JSON.stringify(messages);
    metrics.uploadedTextSeen ||= serialized.includes("FORMAL_UPLOAD_EVIDENCE");
    const tools = (b.tools ?? []).map((t) => t.function.name);
    // Select only tools actually advertised by this request; supports private,
    // revision-bound aliases without embedding those aliases in app code.
    const evidenceTool = (b.tools ?? []).find((entry) =>
      entry.function.description?.includes(
        "Return explicitly synthetic local acceptance rows"
      )
    )?.function.name;
    const privateSkill = messages
      .map((entry) => (typeof entry.content === "string" ? entry.content : ""))
      .join("\n")
      .match(/^- (personal:[a-z0-9-]+)/m)?.[1];
    const lastUserIndex = messages.findLastIndex((m) => m.role === "user");
    const current = messages.slice(Math.max(0, lastUserIndex));
    const calls = current.flatMap((m) => m.tool_calls ?? []);
    const toolOutputs = current.filter((m) => m.role === "tool");
    const finished = (name) =>
      calls.some(
        (c) =>
          c.function.name === name &&
          toolOutputs.some((o) => o.tool_call_id === c.id)
      );
    const invocation = (name, args) => ({
      function: { arguments: JSON.stringify(args), name },
      id: `formal_${randomUUID().replaceAll("-", "")}`,
      type: "function",
    });
    let call,
      extraCall,
      text =
        "FORMAL_ACCEPTANCE_DONE：本地模拟模型与本地模拟 MCP 已完成；结果来自真实工具和真实数据库。";
    if (
      tools.length &&
      serialized.includes("FORMAL_STOP") &&
      !JSON.stringify(messages[lastUserIndex]).includes("FORMAL_STOP")
    ) {
      text = "FORMAL_RESUMED_DONE：只在用户显式继续后开始了新的用户轮次。";
    } else if (tools.length) {
      if (serialized.includes("FORMAL_STOP")) {
        res.writeHead(200, {
          "Cache-Control": "no-cache",
          "Content-Type": "text/event-stream",
        });
        const id = `chatcmpl-${randomUUID()}`;
        const send = (delta, finish_reason = null) =>
          res.write(
            "data: " +
              JSON.stringify({
                choices: [{ delta, finish_reason, index: 0 }],
                created: Math.floor(Date.now() / 1000),
                id,
                model: "formal-fixture",
                object: "chat.completion.chunk",
              }) +
              "\n\n"
          );
        send({
          content: "FORMAL_STOP_PARTIAL：这段已生成内容应保留。",
          role: "assistant",
        });
        const interval = setInterval(() => {
          if (!res.destroyed) {
            send({ content: " 等待中。" });
          }
        }, 1000);
        const timer = setTimeout(() => {
          clearInterval(interval);
          if (!res.destroyed) {
            send({}, "stop");
            res.end("data: [DONE]\n\n");
          }
        }, 45_000);
        res.on("close", () => {
          clearInterval(interval);
          clearTimeout(timer);
          metrics.aborted += 1;
          record({ type: "model-closed" });
        });
        return;
      }
      if (
        privateSkill &&
        tools.includes("loadSkill") &&
        !finished("loadSkill")
      ) {
        call = invocation("loadSkill", { name: privateSkill });
      } else if (tools.includes("updateTodo") && !finished("updateTodo")) {
        call = invocation("updateTodo", {
          items: [
            { id: "read", status: "completed", title: "核对已上传文档" },
            {
              id: "ask",
              status: "in_progress",
              title: "确认结果格式并获取工具证据",
            },
            { id: "artifact", status: "pending", title: "创建可重开的结果表" },
          ],
        });
      } else if (tools.includes("askUser") && !finished("askUser")) {
        call = invocation("askUser", {
          questions: [
            {
              id: "format",
              label: "请确认结果格式",
              options: [
                { label: "结果表", value: "table" },
                { label: "简要说明", value: "summary" },
              ],
              required: true,
              type: "single",
            },
            {
              id: "notes",
              label: `补充说明 ${"长问题边界验证。".repeat(20)}`,
              required: true,
              type: "text",
            },
            {
              id: "fields",
              label: "需要保留哪些字段",
              options: [
                { label: "名称", value: "name" },
                { label: "价格", value: "price" },
              ],
              required: true,
              type: "multi",
            },
          ],
          title: "确认本地验收结果格式",
        });
        if (evidenceTool) {
          extraCall = invocation(evidenceTool, {
            query: "FORMAL synthetic rows, local fixture only",
          });
        }
      } else if (tools.includes(evidenceTool) && !finished(evidenceTool)) {
        call = invocation(evidenceTool, {
          query: "FORMAL synthetic rows, local fixture only",
        });
      } else if (
        evidenceTool &&
        tools.includes("createResultTable") &&
        !finished("createResultTable")
      ) {
        const evidenceCall = calls.find(
          (c) => c.function.name === evidenceTool
        );
        const evidenceOutput = toolOutputs.find(
          (o) => o.tool_call_id === evidenceCall?.id
        );
        let evidence;
        try {
          evidence = JSON.parse(evidenceOutput?.content);
        } catch {
          evidence = undefined;
        }
        if (!evidence?.evidenceAvailable) {
          throw new Error(
            "createResultTable requires actual successful MCP evidence projection"
          );
        }
        call = invocation("createResultTable", {
          columns: [
            { label: "名称", path: "/name" },
            { label: "价格", path: "/price" },
          ],
          rowsPath: "/rows",
          sourceToolCallId: evidence.sourceToolCallId,
          title: "FORMAL 本地证据结果表",
        });
      } else if (
        finished("createResultTable") &&
        tools.includes("updateTodo") &&
        calls.filter((c) => c.function.name === "updateTodo").length < 2
      ) {
        call = invocation("updateTodo", {
          items: [
            { id: "read", status: "completed", title: "核对已上传文档" },
            {
              id: "ask",
              status: "completed",
              title: "确认结果格式并获取工具证据",
            },
            {
              id: "artifact",
              status: "completed",
              title: "创建可重开的结果表",
            },
          ],
        });
      }
    } else {
      text = "FORMAL 本地验收";
    }
    const event = {
      chosen: call?.function.name ?? "text",
      toolResults: toolOutputs.map((o) => o.tool_call_id),
      tools,
      type: "model-call",
      uploadedTextSeen: serialized.includes("FORMAL_UPLOAD_EVIDENCE"),
    };
    metrics.requests.push(event);
    record(event);
    const id = `chatcmpl-${randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);
    if (!b.stream) {
      return json(res, {
        choices: [
          {
            finish_reason: call ? "tool_calls" : "stop",
            index: 0,
            message: {
              content: call ? null : text,
              role: "assistant",
              ...(call
                ? { tool_calls: [call, ...(extraCall ? [extraCall] : [])] }
                : {}),
            },
          },
        ],
        created: now,
        id,
        model: "formal-fixture",
        object: "chat.completion",
        usage: { completion_tokens: 25, prompt_tokens: 25, total_tokens: 50 },
      });
    }
    res.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": "text/event-stream",
    });
    const send = (delta, finish_reason = null) =>
      res.write(
        "data: " +
          JSON.stringify({
            choices: [{ delta, finish_reason, index: 0 }],
            created: now,
            id,
            model: "formal-fixture",
            object: "chat.completion.chunk",
          }) +
          "\n\n"
      );
    send({
      role: "assistant",
      ...(call
        ? {
            tool_calls: [
              { index: 0, ...call },
              ...(extraCall ? [{ index: 1, ...extraCall }] : []),
            ],
          }
        : { content: text }),
    });
    send({}, call ? "tool_calls" : "stop");
    res.end("data: [DONE]\n\n");
  } catch (error) {
    record({ error: String(error), type: "model-error" });
    if (res.headersSent) {
      res.end();
    } else {
      json(
        res,
        { error: { message: String(error), type: "fixture_error" } },
        500
      );
    }
  }
});
mcpHttp.listen(4019, "127.0.0.1");
modelHttp.listen(4018, "127.0.0.1", () =>
  console.log(
    "Local acceptance model 4018 and MCP 4019 ready; synthetic fixtures only."
  )
);
writeFileSync(
  path.resolve(".local-review/formal-agent.json"),
  JSON.stringify(
    {
      maxOutputTokens: 8000,
      maxSteps: 12,
      servers: [
        {
          allowedTools: ["review_rows"],
          autoApproveTools: [],
          headers: {},
          id: "formal",
          name: "本地验收模拟数据",
          // biome-ignore lint/suspicious/noTemplateCurlyInString: Agent config intentionally resolves this environment reference.
          url: "${FORMAL_MCP_URL}",
        },
      ],
      timeoutMs: 240_000,
      toolTimeoutMs: 30_000,
    },
    null,
    2
  )
);

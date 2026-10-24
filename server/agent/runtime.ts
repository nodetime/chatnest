import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { dynamicTool, type ToolSet } from "ai";
import { resolveServerConnection } from "@/server/agent/config";
import { normalizeMcpOutput } from "@/server/agent/mcp-output";
import {
  abortable,
  closeManagedClient,
} from "@/server/agent/mcp-settings/lifecycle";
import {
  listNativeTools,
  nativeRuntimeTools,
} from "@/server/agent/mcp-settings/native-tools";
import {
  DISCOVERY_TIMEOUT_MS,
  guardedFetch,
} from "@/server/agent/mcp-settings/network";
import {
  type RuntimeConfig,
  readRuntimeConfig,
  toolAlias,
} from "@/server/agent/mcp-settings/runtime-config";
import { createPortaToolError } from "@/server/agent/porta-error";
import {
  type McpSourceMetadata,
  ResultEvidenceLedger,
  sourceModelOutput,
} from "@/server/agent/result-evidence";
import {
  buildSkillsPrompt,
  createSkillTools,
  discoverSkills,
} from "@/server/agent/skills";

export async function createAgentRuntime(
  signal: AbortSignal,
  connect: typeof createMCPClient = createMCPClient,
  loadConfig: () => Promise<RuntimeConfig> = readRuntimeConfig,
  evidence: {
    ledger?: ResultEvidenceLedger;
    onSource?: (source: McpSourceMetadata) => void;
  } = {}
) {
  const [config, skills] = await Promise.all([
    loadConfig().then((snapshot) => structuredClone(snapshot)),
    discoverSkills(),
  ]);
  const ledger = evidence.ledger ?? new ResultEvidenceLedger();
  const clients = new Set<MCPClient>();
  const runSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(config.timeoutMs),
  ]);
  const tools: ToolSet = { ...createSkillTools(skills) };
  const unavailable: string[] = [];
  const close = async () => {
    await Promise.allSettled(
      [...clients].map((client) => closeManagedClient(client))
    );
    clients.clear();
  };

  try {
    const results = await Promise.allSettled(
      config.servers.map(async (server) => {
        runSignal.throwIfAborted();
        const { headers, missing, url, invalid } =
          resolveServerConnection(server);
        if (missing.length > 0) {
          unavailable.push(`${server.name}: credentials are not configured`);
          return;
        }
        if (invalid || !url) {
          unavailable.push(`${server.name}: endpoint configuration is invalid`);
          return;
        }
        let client: MCPClient | undefined;
        try {
          const setupSignal = server.managed
            ? AbortSignal.any([
                runSignal,
                AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
              ])
            : runSignal;
          client = await abortable(
            () =>
              connect({
                ...(server.managed ? { maxRetries: 0 } : {}),
                transport: {
                  fetch: server.managed
                    ? guardedFetch({ headers, url }, process.env, runSignal)
                    : (input, init) =>
                        fetch(input, {
                          ...init,
                          // Do not let redirects evade endpoint policy or move credentials.
                          redirect: "error",
                          signal: AbortSignal.any([
                            runSignal,
                            AbortSignal.timeout(config.toolTimeoutMs),
                            ...(init?.signal ? [init.signal] : []),
                          ]),
                        }),
                  headers,
                  type: "http",
                  url,
                },
              }),
            setupSignal,
            (late) => {
              closeManagedClient(late).catch(() => undefined);
            }
          );
          clients.add(client);
          const discovered = server.managed
            ? nativeRuntimeTools(
                client,
                await listNativeTools(client, setupSignal)
              )
            : await client.tools();
          runSignal.throwIfAborted();
          const serverTools: ToolSet = {};
          for (const [name, remote] of Object.entries(discovered)) {
            if (!server.allowedTools.includes(name)) {
              continue;
            }
            const alias = toolAlias(server.id, name);
            if (tools[alias]) {
              throw new Error("MCP tool alias collision");
            }
            serverTools[alias] = dynamicTool({
              description: `${server.name}: ${remote.description ?? name}`,
              execute: (input, options) => {
                runSignal.throwIfAborted();
                ledger.reserveCurrentCall(options.toolCallId, alias);
                return (async () => {
                  let output: unknown;
                  try {
                    const callSignal = AbortSignal.any([
                      runSignal,
                      AbortSignal.timeout(config.toolTimeoutMs),
                      ...(options.abortSignal ? [options.abortSignal] : []),
                    ]);
                    output = await abortable(
                      () =>
                        remote.execute(input, {
                          ...options,
                          abortSignal: callSignal,
                        }),
                      callSignal
                    );
                  } catch {
                    // SDK exceptions can contain the full URL and authorization headers.
                    // biome-ignore lint/style/useErrorCause: Raw SDK/crypto causes may contain credentials; intentionally discard.
                    throw new Error(`${server.name}: tool execution failed`);
                  }
                  if (
                    output &&
                    typeof output === "object" &&
                    "isError" in output &&
                    output.isError
                  ) {
                    if (server.id === "porta" && !server.managed) {
                      throw createPortaToolError(output, {
                        ...headers,
                        endpoint: url,
                      });
                    }
                    throw new Error(
                      `${server.name} 暂时未能返回结果；可能是限流或访问失败，请稍后重试。`
                    );
                  }
                  const source = ledger.record(
                    {
                      completedAt: new Date().toISOString(),
                      serverId: server.id,
                      serverName: server.name,
                      timeBasis: "tool-completed",
                      toolCallId: options.toolCallId,
                      toolName: alias,
                    },
                    output
                  );
                  evidence.onSource?.(source);
                  return normalizeMcpOutput(server.id, name, output);
                })();
              },
              inputSchema: remote.inputSchema,
              needsApproval:
                server.managed || !server.autoApproveTools.includes(name),
              toModelOutput: ({ toolCallId, output }) =>
                sourceModelOutput(ledger, toolCallId, output),
            });
          }
          Object.assign(tools, serverTools);
        } catch {
          if (runSignal.aborted) {
            // biome-ignore lint/style/useErrorCause: Do not retain sensitive SDK errors as a loggable cause.
            throw new Error("MCP setup was cancelled");
          }
          unavailable.push(
            `${server.name}: connection or tool discovery failed`
          );
          if (client) {
            clients.delete(client);
            await closeManagedClient(client);
          }
        }
      })
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") {
      throw failed.reason;
    }
    runSignal.throwIfAborted();
    return {
      close,
      config,
      instructions: `${buildSkillsPrompt(skills)}\nAvailable execution tools: ${Object.keys(tools).join(", ")}\nUnavailable services: ${unavailable.join("; ") || "none"}. Never claim to have used an unavailable service.`,
      signal: runSignal,
      tools,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

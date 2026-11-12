import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  convertToModelMessages,
  createUIMessageStream,
  generateText,
  isStepCount,
  readUIMessageStream,
  tool,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import {
  projectLoadedSkillResultsForModel,
  projectSkillContextForModel,
} from "@/server/domain/capability/projection";
import {
  createRunFailureReporter,
  hasRunFailure,
} from "@/server/domain/message/run-failure";
import type { ChatMessage } from "@/server/domain/message/types";
import { createAgentRuntime } from "@/server/infrastructure/mcp/runtime";
import { completionStepSettings, systemPrompt } from "../ai/prompts";
import { executionStepLimit } from "./execution-policy";
import { agentInteractionTools } from "./tools/agent-interactions";

const modelUsage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
};

test("首次按需加载的授权技能在下一模型步骤进入当前指令，发现阶段不预载", async () => {
  const active = new Map<string, string>();
  const body = "FIRST_LOADED_METHOD";
  const runtime = await createAgentRuntime(
    new AbortController().signal,
    undefined,
    () =>
      Promise.resolve({
        maxOutputTokens: 1000,
        maxSteps: 3,
        servers: [],
        timeoutMs: 10_000,
        toolTimeoutMs: 1000,
      }),
    {
      onSkillLoaded: (name, instructions) => {
        active.set(name, instructions);
      },
      skills: [
        {
          description: "Test method",
          directory: "",
          markdown: `---\nname: method\ndescription: Test method\n---\n${body}`,
          name: "method",
        },
      ],
    }
  );
  let calls = 0;
  try {
    const model = new MockLanguageModelV4({
      doGenerate: (options) => {
        calls += 1;
        const system = options.prompt
          .filter((message) => message.role === "system")
          .map((message) => message.content)
          .join("\n");
        assert.equal(system.includes(body), calls === 2);
        assert.equal(
          JSON.stringify(options.prompt).split(body).length - 1,
          calls === 2 ? 1 : 0,
          "current skill body appears once across system and tool messages"
        );
        return Promise.resolve({
          content:
            calls === 1
              ? [
                  {
                    input: '{"name":"method"}',
                    toolCallId: "load",
                    toolName: "loadSkill",
                    type: "tool-call" as const,
                  },
                ]
              : [{ text: "完成", type: "text" as const }],
          finishReason: {
            raw: calls === 1 ? "tool_calls" : "stop",
            unified: calls === 1 ? ("tool-calls" as const) : ("stop" as const),
          },
          usage: modelUsage,
          warnings: [],
        });
      },
    });
    const result = await generateText({
      model,
      prepareStep: ({ messages }) => ({
        instructions: [
          runtime.instructions,
          projectSkillContextForModel([], active).instructions,
        ]
          .filter(Boolean)
          .join("\n\n"),
        messages: projectLoadedSkillResultsForModel(messages, active),
      }),
      prompt: "Use the task method.",
      stopWhen: isStepCount(3),
      tools: runtime.tools,
    });
    assert.equal(result.text, "完成");
    assert.equal(calls, 2);
    assert.equal(active.get("method")?.trim(), body);
    assert.equal(
      (
        result.steps[0].toolResults[0].output as { instructions: string }
      ).instructions.trim(),
      body
    );
  } finally {
    await runtime.close();
  }
});

test("真实 SDK 在既有步数内提示保存产物与交接，保留供应商原生工具协议", async () => {
  let calls = 0;
  const executed: string[] = [];
  const maxSteps = 4;
  const instructions = [
    "Complete the requested task. RUNTIME_TOOL_CATALOG",
    projectSkillContextForModel(
      [],
      new Map([["method", "CURRENT_AUTHORIZED_METHOD"]])
    ).instructions,
  ].join("\n\n");
  const model = new MockLanguageModelV4({
    doGenerate: (options) => {
      calls += 1;
      assert.equal(
        JSON.stringify(options.prompt).split("CURRENT_AUTHORIZED_METHOD")
          .length,
        2,
        "including completion steps, the current skill is present exactly once"
      );
      if (calls === maxSteps) {
        assert.deepEqual(options.toolChoice, { type: "auto" });
        assert.equal(options.tools?.length, 2);
        assert.match(JSON.stringify(options.prompt), /Complete this turn/);
        assert.doesNotMatch(
          JSON.stringify(options.prompt),
          /Tool use is disabled|answer-only/
        );
        assert.match(JSON.stringify(options.prompt), /RUNTIME_TOOL_CATALOG/);
        return Promise.resolve({
          content: [
            { text: "对比表已保存，另有一项待补充。", type: "text" as const },
          ],
          finishReason: { raw: "stop", unified: "stop" as const },
          usage: modelUsage,
          warnings: [],
        });
      }
      const toolName = calls === maxSteps - 1 ? "writeFile" : "search";
      if (toolName === "writeFile") {
        assert.match(JSON.stringify(options.prompt), /Complete this turn/);
      } else {
        assert.doesNotMatch(
          JSON.stringify(options.prompt),
          /Complete this turn/
        );
      }
      return Promise.resolve({
        content: [
          {
            input: "{}",
            toolCallId: `call-${calls}`,
            toolName,
            type: "tool-call" as const,
          },
        ],
        finishReason: { raw: "tool_calls", unified: "tool-calls" as const },
        usage: modelUsage,
        warnings: [],
      });
    },
  });
  const result = await generateText({
    instructions,
    model,
    prepareStep: ({ stepNumber }) =>
      completionStepSettings(stepNumber, maxSteps, instructions),
    prompt: "比较已有候选并保存表格",
    stopWhen: isStepCount(maxSteps),
    tools: Object.fromEntries(
      ["search", "writeFile"].map((name) => [
        name,
        tool({
          execute: () => {
            executed.push(name);
            return { saved: name === "writeFile" };
          },
          inputSchema: z.object({}),
        }),
      ])
    ),
  });
  assert.equal(calls, maxSteps);
  assert.deepEqual(executed, ["search", "search", "writeFile"]);
  assert.equal(result.text, "对比表已保存，另有一项待补充。");
});

test("默认原生工具循环超过12轮，保存文件后仍可正常交接", async () => {
  const { agentConfigSchema } = await import(
    "@/server/infrastructure/mcp/config"
  );
  const { maxSteps } = agentConfigSchema.parse({});
  let calls = 0;
  let executions = 0;
  let failures = 0;
  const saved: string[] = [];
  const result = await generateText({
    maxRetries: 0,
    model: new MockLanguageModelV4({
      doGenerate: () => {
        calls += 1;
        return Promise.resolve({
          content:
            calls === 15
              ? [{ text: "表格已保存。", type: "text" as const }]
              : [
                  {
                    input: "{}",
                    toolCallId: `call-${calls}`,
                    toolName: calls === 14 ? "writeFile" : "readFile",
                    type: "tool-call" as const,
                  },
                ],
          finishReason: {
            raw: calls === 15 ? "stop" : "tool_calls",
            unified: calls === 15 ? ("stop" as const) : ("tool-calls" as const),
          },
          usage: modelUsage,
          warnings: [],
        });
      },
    }),
    prepareStep: ({ stepNumber }) => {
      const settings = completionStepSettings(stepNumber, maxSteps, "TASK");
      assert.deepEqual(settings, {}, "no artificial final-step instruction");
      return settings;
    },
    prompt: "读取来源，保存表格后交接",
    stopWhen: executionStepLimit(maxSteps, () => {
      failures += 1;
    }),
    timeout: { totalMs: 1000 },
    tools: Object.fromEntries(
      ["readFile", "writeFile"].map((name) => [
        name,
        tool({
          execute: () => {
            executions += 1;
            if (name === "writeFile") {
              saved.push("result.csv");
            }
            return { status: "completed" };
          },
          inputSchema: z.object({}),
        }),
      ])
    ),
  });
  assert.equal(result.text, "表格已保存。");
  assert.equal(calls, 15);
  assert.equal(executions, 14);
  assert.deepEqual(saved, ["result.csv"]);
  assert.equal(failures, 0);
});

test("发布配置不恢复12轮截断，聊天路由允许默认总时长", async () => {
  const { agentConfigSchema } = await import(
    "@/server/infrastructure/mcp/config"
  );
  const config = agentConfigSchema.parse(
    JSON.parse(
      readFileSync(
        new URL("../../infrastructure/mcp/agent.json", import.meta.url),
        "utf8"
      )
    )
  );
  assert.equal(config.maxSteps, null);
  assert.equal(config.timeoutMs, 900_000);
  assert.match(
    readFileSync("app/(chat)/api/chat/route.ts", "utf8"),
    /export const maxDuration = 900;/
  );
  assert.match(
    readFileSync("server/application/chat/send-message.ts", "utf8"),
    /maxRetries: 0/
  );
});

for (const mode of ["cancel", "timeout"] as const) {
  test(`无默认轮数上限时仍响应 ${mode}，不重试模型请求`, async () => {
    const controller = new AbortController();
    let calls = 0;
    let aborted = false;
    const result = generateText({
      abortSignal: controller.signal,
      maxRetries: 0,
      model: new MockLanguageModelV4({
        doGenerate: ({ abortSignal }) => {
          calls += 1;
          return new Promise((_resolve, reject) => {
            const abort = () => {
              aborted = true;
              reject(abortSignal?.reason);
            };
            if (abortSignal?.aborted) {
              abort();
            } else {
              abortSignal?.addEventListener("abort", abort, { once: true });
            }
            if (mode === "cancel") {
              queueMicrotask(() => controller.abort());
            }
          });
        },
      }),
      prompt: "test",
      stopWhen: executionStepLimit(null, () => {
        assert.fail("not a step cutoff");
      }),
      timeout: { totalMs: 25 },
    });
    await assert.rejects(result);
    assert.equal(calls, 1);
    assert.equal(aborted, true);
  });
}

for (const mode of ["answer", "ask", "loop", "tool-stop"] as const) {
  test(`真实 SDK 步数边界：${mode}`, async () => {
    let failure = 0;
    const definitions = agentInteractionTools();
    const result = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: {
          content:
            mode === "answer"
              ? [{ text: "已完成", type: "text" }]
              : [
                  {
                    input:
                      mode === "ask"
                        ? JSON.stringify({
                            questions: [
                              {
                                id: "reference",
                                label: "参照",
                                required: true,
                                type: "text",
                              },
                            ],
                            title: "补充参照",
                          })
                        : "{}",
                    toolCallId: "call",
                    toolName: mode === "ask" ? "askUser" : "search",
                    type: "tool-call",
                  },
                ],
          finishReason: {
            raw: ["answer", "tool-stop"].includes(mode) ? "stop" : "tool_calls",
            unified: ["answer", "tool-stop"].includes(mode)
              ? "stop"
              : "tool-calls",
          },
          usage: modelUsage,
          warnings: [],
        },
      }),
      prompt: "完成任务",
      stopWhen: executionStepLimit(1, () => {
        failure += 1;
      }),
      tools: {
        askUser: tool(definitions.askUser),
        search: tool({ execute: () => "found", inputSchema: z.object({}) }),
      },
    });
    assert.equal(failure, ["loop", "tool-stop"].includes(mode) ? 1 : 0, mode);
    assert.equal(result.steps.length, 1, mode);
  });
}

test("通用提示词按能力注入交互规则，不向无工具模型许诺工具，也不硬编码业务 SOP", () => {
  const markdown = readFileSync(
    new URL("../ai/core.md", import.meta.url),
    "utf8"
  );
  const [core, tools] = markdown.split(/<!-- (?:tools|completion) -->/);
  assert.equal(systemPrompt({ supportsTools: false }), core.trim());
  assert.equal(
    systemPrompt({ supportsTools: true }),
    `${core.trim()}\n\n${tools.trim()}`
  );
  const plain = systemPrompt({ supportsTools: false });
  const agent = systemPrompt({ supportsTools: true });
  assert.doesNotMatch(plain, /askUser|updateTodo|createDocument/);
  assert.match(agent, /askUser/);
  assert.match(agent, /updateTodo/);
  assert.match(agent, /follow host policy/i);
  assert.match(agent, /unknown execution outcome/);
  assert.match(agent, /requested outcome was actually achieved/i);
  assert.doesNotMatch(
    agent,
    /1688|onebound|旅行包|infringement|lawyer|requestHints|About the origin|source material/
  );
});

test("askUser 是无 execute 的客户端工具；Todo 用经过规范校验的完整快照执行", async () => {
  assert.equal(typeof agentInteractionTools, "function");
  const definitions = agentInteractionTools();
  assert.equal(definitions.askUser.execute, undefined);
  assert.equal(definitions.askUser.needsApproval, undefined);
  assert.ok(definitions.askUser.inputSchema);
  const plan = {
    items: [{ id: "check", status: "in_progress" as const, title: "核对来源" }],
  };
  assert.ok(definitions.updateTodo.execute);
  const actual = await definitions.updateTodo.execute(plan, {
    context: {},
    messages: [],
    toolCallId: "todo",
  });
  assert.deepEqual(actual, plan);
});

test("SDK 续跑保持同一个 assistant 与原始问题，答案进入模型上下文", async () => {
  const input = {
    questions: [
      { id: "goal", label: "目标", required: true, type: "text" as const },
    ],
    title: "目标",
  };
  const output = { answers: { goal: "核对引用" }, status: "answered" as const };
  const original: ChatMessage = {
    id: "a",
    parts: [
      {
        input,
        output,
        state: "output-available",
        toolCallId: "ask",
        type: "tool-askUser",
      },
    ],
    role: "assistant",
  };
  let saved: ChatMessage | undefined;
  const stream = createUIMessageStream<ChatMessage>({
    execute: () => {
      /* 不追加生成内容，仅检查原消息恢复。 */
    },
    onEnd: ({ responseMessage }) => {
      saved = responseMessage;
    },
    originalMessages: [original],
  });
  for await (const _ of readUIMessageStream({
    message: structuredClone(original),
    stream,
  })) {
    /* actual SDK lifecycle */
  }
  assert.equal(saved?.id, "a");
  assert.deepEqual(saved?.parts, original.parts);
  const model = await convertToModelMessages([original], {
    tools: { askUser: tool(agentInteractionTools().askUser) },
  });
  assert.match(JSON.stringify(model), /核对引用/);
});

test("服务端在模型调用前事务保存 Ask，部分回答/重复提交不调用模型，完成写回有并发基线", () => {
  const source = readFileSync(
    new URL("./send-message.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /mergeInteractionResponses/);
  assert.ok(
    source.indexOf("messageRepo.mergeInteractionResponses") <
      source.indexOf("await getCapabilities")
  );
  assert.match(source, /hasPendingInteraction/);
  assert.match(source, /updateContinuationParts/);
  const repository = readFileSync(
    new URL(
      "../../infrastructure/persistence/drizzle/message-repository.ts",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(repository, /async mergeInteractionResponses/);
  assert.match(repository, /async updateContinuationParts/);
  assert.match(repository, /applyAskUserResponses/);
  assert.match(repository, /\.for\("update"\)/);
});

test("无轮数截断的真实SDK流在第14步保存后正常回复，不落失败标记或重放工具", async () => {
  const { streamText, toUIMessageStream, jsonSchema } = await import("ai");
  const reporter = createRunFailureReporter();
  let calls = 0;
  let saves = 0;
  let persisted: ChatMessage | undefined;
  const model = new MockLanguageModelV4({
    doStream: () => {
      calls += 1;
      const final = calls === 15;
      return Promise.resolve({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            if (final) {
              controller.enqueue({ id: "answer", type: "text-start" });
              controller.enqueue({
                delta: "表格已保存。",
                id: "answer",
                type: "text-delta",
              });
              controller.enqueue({ id: "answer", type: "text-end" });
            } else {
              controller.enqueue({
                input: "{}",
                toolCallId: `call-${calls}`,
                toolName: calls === 14 ? "writeFile" : "readFile",
                type: "tool-call",
              });
            }
            controller.enqueue({
              finishReason: final
                ? { raw: "stop", unified: "stop" }
                : { raw: "tool_calls", unified: "tool-calls" },
              type: "finish",
              usage: {
                inputTokens: {
                  cacheRead: 0,
                  cacheWrite: 0,
                  noCache: 1,
                  total: 1,
                },
                outputTokens: { reasoning: 0, text: 1, total: 1 },
              },
            });
            controller.close();
          },
        }),
      });
    },
  });
  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer }) => {
      const result = streamText({
        maxRetries: 0,
        model,
        prompt: "保存后交接",
        stopWhen: executionStepLimit(null, () => {
          reporter.report((part) => writer.write(part));
        }),
        timeout: { totalMs: 1000 },
        tools: {
          readFile: {
            execute: () => "source",
            inputSchema: jsonSchema({ properties: {}, type: "object" }),
          },
          writeFile: {
            execute: () => {
              saves += 1;
              return { saved: "outputs/result.csv" };
            },
            inputSchema: jsonSchema({ properties: {}, type: "object" }),
          },
        },
      });
      writer.merge(toUIMessageStream({ stream: result.stream }));
      await result.text;
    },
    onEnd: ({ responseMessage }) => {
      persisted = responseMessage;
    },
  });
  for await (const _ of readUIMessageStream({ stream })) {
    /* consume SDK lifecycle */
  }
  assert.equal(calls, 15);
  assert.equal(saves, 1);
  assert.ok(persisted);
  assert.equal(hasRunFailure(persisted), false);
  assert.equal(reporter.failed, false);
  assert.match(JSON.stringify(persisted), /outputs\/result.csv/);
  assert.match(JSON.stringify(persisted), /表格已保存/);
});

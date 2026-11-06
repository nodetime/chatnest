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
import type { ChatMessage } from "@/server/domain/message/types";
import { createAgentRuntime } from "@/server/infrastructure/mcp/runtime";
import { completionStepSettings, systemPrompt } from "../ai/prompts";
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
        assert.deepEqual(options.toolChoice, { type: "none" });
        assert.equal(options.tools?.length, 2);
        assert.match(JSON.stringify(options.prompt), /Complete this turn/);
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
      const toolName = calls === maxSteps - 1 ? "createDocument" : "search";
      if (toolName === "createDocument") {
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
      ["search", "createDocument"].map((name) => [
        name,
        tool({
          execute: () => {
            executed.push(name);
            return { saved: name === "createDocument" };
          },
          inputSchema: z.object({}),
        }),
      ])
    ),
  });
  assert.equal(calls, maxSteps);
  assert.deepEqual(executed, ["search", "search", "createDocument"]);
  assert.equal(result.text, "对比表已保存，另有一项待补充。");
});

for (const mode of ["answer", "ask", "loop"] as const) {
  test(`真实 SDK 步数边界：${mode}`, async () => {
    let failure = 0;
    const reachedLimit = isStepCount(2);
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
            raw: mode === "answer" ? "stop" : "tool_calls",
            unified: mode === "answer" ? "stop" : "tool-calls",
          },
          usage: modelUsage,
          warnings: [],
        },
      }),
      prompt: "完成任务",
      stopWhen: async (context) => {
        const reached = await reachedLimit(context);
        if (reached) {
          failure += 1;
        }
        return reached;
      },
      tools: {
        askUser: tool(definitions.askUser),
        search: tool({ execute: () => "found", inputSchema: z.object({}) }),
      },
    });
    assert.equal(failure, mode === "loop" ? 1 : 0, mode);
    assert.equal(result.steps.length, mode === "loop" ? 2 : 1, mode);
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

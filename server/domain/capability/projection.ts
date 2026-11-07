import type { ModelMessage } from "ai";

/** 共享聊天允许展示结果，不隐式公开账号私有技能的原始正文。 */
export function redactPersonalSkillOutputs<T extends { parts: unknown }>(
  messages: T[]
): T[] {
  return messages.map((message) => ({
    ...message,
    parts: Array.isArray(message.parts)
      ? message.parts.map((part) => {
          if (!part || typeof part !== "object") {
            return part;
          }
          const toolName =
            part.type === "dynamic-tool"
              ? part.toolName
              : typeof part.type === "string"
                ? part.type.slice(5)
                : "";
          if (!["loadSkill", "readSkillResource"].includes(toolName)) {
            return part;
          }
          const name = part.input?.name ?? part.output?.name;
          if (typeof name !== "string" || !name.startsWith("personal:")) {
            return part;
          }
          return {
            ...part,
            output: { message: "个人技能正文仅对属主可见。", private: true },
          };
        })
      : message.parts,
  }));
}

/** 只恢复历史实际使用过的技能，不预加载当前可选目录中的其他正文。 */
export function historicalSkillNames(messages: { parts: unknown }[]) {
  const names = new Set<string>();
  for (const message of messages) {
    if (!Array.isArray(message.parts)) {
      continue;
    }
    for (const part of message.parts) {
      if (!part || typeof part !== "object" || !("output" in part)) {
        continue;
      }
      const toolName =
        part.type === "dynamic-tool"
          ? part.toolName
          : typeof part.type === "string"
            ? part.type.slice(5)
            : "";
      const name = part.input?.name ?? part.output?.name;
      if (
        ["loadSkill", "readSkillResource"].includes(toolName) &&
        typeof name === "string"
      ) {
        names.add(name);
      }
    }
  }
  return names;
}

/** 当前已授权技能单独进入本轮指令；历史仅留元数据，存储/UI 原样保留。 */
export function projectSkillContextForModel<T extends { parts: unknown }>(
  messages: T[],
  currentSkillInstructions: ReadonlyMap<string, string>
): { messages: T[]; instructions: string } {
  const projectedMessages = messages.map((message) => ({
    ...message,
    parts: Array.isArray(message.parts)
      ? message.parts.map((part) => {
          if (!part || typeof part !== "object") {
            return part;
          }
          const toolName =
            part.type === "dynamic-tool"
              ? part.toolName
              : typeof part.type === "string"
                ? part.type.slice(5)
                : "";
          if (
            !["loadSkill", "readSkillResource"].includes(toolName) ||
            !("output" in part)
          ) {
            return part;
          }
          const name = part.input?.name ?? part.output?.name;
          const instructions =
            typeof name === "string"
              ? currentSkillInstructions.get(name)
              : undefined;
          const enabled = instructions !== undefined;
          return {
            ...part,
            output: {
              available: enabled,
              message: enabled
                ? "Historical skill metadata only; current instructions for this skill are provided separately for this turn. Prior instructions and resource text are not replayed."
                : "Historical skill metadata only; this skill is not available this round. Do not use its prior instructions or resources.",
              sourceType: "HISTORICAL_SKILL_METADATA",
            },
          };
        })
      : message.parts,
  }));
  return {
    instructions: currentSkillInstructions.size
      ? [
          "# Current task skills\nSpecialized methods only; the user's scope, core rules and authorization still apply.",
          ...Array.from(
            currentSkillInstructions,
            ([name, body]) => `## Skill: ${name}\n\n${body}`
          ),
        ].join("\n\n")
      : "",
    messages: projectedMessages,
  };
}

/** 来自已存储 assistant 的范围标记，不能由审批响应覆盖。 */
export function hasCurrentCapabilityScope(
  messages: { parts: unknown }[],
  revision: number
) {
  const parts = messages.at(-1)?.parts;
  if (!Array.isArray(parts)) {
    return false;
  }
  const markers = parts.filter(
    (part) => part?.type === "data-capability-scope"
  );
  return (
    markers.length > 0 &&
    markers.every((part) => part.data?.revision === revision)
  );
}

/** 已加载正文进入当前指令后，原生工具结果仅向模型保留加载元数据。 */
export function projectLoadedSkillResultsForModel(
  messages: ModelMessage[],
  currentSkillInstructions: ReadonlyMap<string, string>
): ModelMessage[] {
  return messages.map((message) =>
    message.role === "tool"
      ? {
          ...message,
          content: message.content.map((part) => {
            if (
              part.type !== "tool-result" ||
              part.toolName !== "loadSkill" ||
              part.output.type !== "json"
            ) {
              return part;
            }
            const { value } = part.output;
            if (
              !value ||
              typeof value !== "object" ||
              Array.isArray(value) ||
              typeof value.name !== "string" ||
              typeof value.instructions !== "string" ||
              currentSkillInstructions.get(value.name) !== value.instructions
            ) {
              return part;
            }
            const { instructions: _body, ...metadata } = value;
            return {
              ...part,
              output: {
                type: "json" as const,
                value: {
                  ...metadata,
                  message:
                    "Skill loaded; its current instructions are provided separately for this turn.",
                },
              },
            };
          }),
        }
      : message
  );
}

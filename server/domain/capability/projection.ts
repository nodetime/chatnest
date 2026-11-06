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

/** 本轮模型使用当前已授权技能正文；存储/UI 保留原始调用证据。 */
export function projectSkillHistoryForModel<T extends { parts: unknown }>(
  messages: T[],
  currentSkillInstructions: ReadonlyMap<string, string>
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
          if (enabled && toolName === "loadSkill") {
            return {
              ...part,
              output: {
                instructions,
                name,
                sourceType: "CURRENT_SKILL_INSTRUCTIONS",
              },
            };
          }
          return {
            ...part,
            output: {
              available: enabled,
              message: enabled
                ? "Historical skill metadata only; prior instructions and resource text are not replayed. This skill is available this round. Load its current instructions before continuing work within its scope."
                : "Historical skill metadata only; this skill is not available this round. Do not use its prior instructions or resources.",
              sourceType: "HISTORICAL_SKILL_METADATA",
            },
          };
        })
      : message.parts,
  }));
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

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

/** 只投影给本轮模型；存储/UI 保留原始证据，当前运行新加载的正文不受影响。 */
export function projectSkillHistoryForModel<T extends { parts: unknown }>(
  messages: T[],
  availableSkillNames: readonly string[]
): T[] {
  const available = new Set(availableSkillNames);
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
          const enabled = typeof name === "string" && available.has(name);
          return {
            ...part,
            output: {
              available: enabled,
              message: enabled
                ? "Historical skill metadata only; prior instructions and resource text are not replayed. This skill is available this round; optionally load its current instructions when relevant."
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

import matter from "gray-matter";
import { z } from "zod";

export const selectionSchema = z
  .object({
    serverIds: z.array(z.string().min(1).max(160)).max(32),
    skillIds: z.array(z.string().min(1).max(160)).max(64),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.serverIds).size === value.serverIds.length &&
      new Set(value.skillIds).size === value.skillIds.length,
    "能力选择不能重复"
  );
export type CapabilitySelection = z.infer<typeof selectionSchema>;
export function resolveSelection(
  input: CapabilitySelection | undefined,
  servers: string[],
  skills: string[]
): CapabilitySelection {
  const selected = selectionSchema.parse(
    input ?? { serverIds: servers, skillIds: skills }
  );
  if (
    selected.serverIds.some((id) => !servers.includes(id)) ||
    selected.skillIds.some((id) => !skills.includes(id))
  ) {
    throw new Error("所选能力不存在、已停用或不属于当前账号。");
  }
  return selected;
}
const metadataSchema = z
  .object({
    "allowed-tools": z.string().max(2048).optional(),
    compatibility: z.string().max(1024).optional(),
    description: z.string().trim().min(1).max(1024),
    license: z.string().max(1024).optional(),
    metadata: z
      .object({
        "display-name": z.string().min(1).max(80).optional(),
        "short-description": z.string().min(1).max(240).optional(),
      })
      .catchall(z.string().max(1000))
      .optional(),
    name: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(64),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (
      Object.keys(data).some((name) =>
        [
          "command",
          "args",
          "hooks",
          "scripts",
          "install",
          "run",
          "setup",
        ].includes(name.toLowerCase())
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "技能导入仅支持文本指令，不接受执行配置。",
      });
    }
  });
export function parseSkillMarkdown(markdown: string) {
  if (
    typeof markdown !== "string" ||
    new TextEncoder().encode(markdown).length > 64_000 ||
    markdown.includes("\u0000") ||
    !/^---\r?\n/.test(markdown)
  ) {
    throw new Error("请导入最多 64 KB 的标准 SKILL.md 文本。");
  }
  // 固定 YAML frontmatter；绝不启用 gray-matter 的 JS/CoffeeScript 等执行引擎。
  const parsed = matter(markdown, { language: "yaml" });
  const data = metadataSchema.parse(parsed.data);
  if (!parsed.content.trim()) {
    throw new Error("技能指令不能为空。");
  }
  return { ...data, instructions: parsed.content, markdown };
}
export const personalSkillSchema = z
  .object({
    enabled: z.boolean(),
    id: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(64),
    markdown: z.string().max(64_000),
  })
  .strict();
export const personalSkillsSchema = z
  .array(personalSkillSchema)
  .max(32)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length
  );
export const personalSkillSettingsSchema = z
  .object({
    disabledBuiltinIds: z.array(z.string().max(160)).max(128),
    skills: personalSkillsSchema,
  })
  .strict();
export type PersonalSkill = z.infer<typeof personalSkillSchema>;
const revision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
export const skillActionSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("preview"), markdown: z.string().max(64_000) })
    .strict(),
  z
    .object({ action: z.literal("read"), id: z.string().min(1).max(160) })
    .strict(),
  z
    .object({
      action: z.literal("save"),
      enabled: z.boolean(),
      id: personalSkillSchema.shape.id,
      markdown: z.string().max(64_000),
      revision,
    })
    .strict(),
  z
    .object({
      action: z.literal("toggle"),
      enabled: z.boolean(),
      id: z.string().min(1).max(160),
      revision,
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      id: personalSkillSchema.shape.id,
      revision,
    })
    .strict(),
  z
    .object({
      action: z.literal("copy"),
      id: z.string().min(1).max(160),
      newId: personalSkillSchema.shape.id,
      revision,
    })
    .strict(),
]);
export type SkillAction = z.infer<typeof skillActionSchema>;
export type SkillProjection = {
  id: string;
  name: string;
  description: string;
  displayName?: string;
  shortDescription?: string;
  enabled: boolean;
  source: "builtin" | "personal";
};
export type ScopeSnapshot = {
  revision: number;
  selection: CapabilitySelection;
  grants: Record<string, string>;
};

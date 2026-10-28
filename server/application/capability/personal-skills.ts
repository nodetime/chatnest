import "server-only";
import {
  type Environment,
  SettingsError,
} from "@/server/application/mcp/security";
import {
  type PersonalSkill,
  parseSkillMarkdown,
  personalSkillSettingsSchema,
  personalSkillsSchema,
  type SkillAction,
  type SkillProjection,
  skillActionSchema,
} from "@/server/domain/capability/schema";
import {
  discoverSkills,
  readSkillFile,
  type Skill,
} from "@/server/infrastructure/mcp/skills";
import { personalSettingsRepository } from "@/server/infrastructure/persistence/drizzle/capability-repository";
import type { SettingsRepository } from "@/server/infrastructure/persistence/drizzle/mcp-settings-repository";
import {
  decryptSettings,
  encryptSettings,
  parseEncryptionKey,
} from "@/server/shared/settings-crypto";

export function skillProjection(skill: Skill): SkillProjection {
  return {
    description: skill.description,
    displayName: skill.displayName,
    enabled: true,
    id: skill.id ?? `builtin:${skill.name}`,
    name: skill.name,
    shortDescription: skill.shortDescription,
    source: skill.source ?? "builtin",
  };
}
export function createPersonalSkillsService({
  userId,
  repository = personalSettingsRepository(userId, "skills"),
  env = process.env,
  builtins = discoverSkills,
}: {
  userId: string;
  repository?: SettingsRepository;
  env?: Environment;
  builtins?: () => Promise<Skill[]>;
}) {
  const domain = `personal-skills:${userId}`;
  function configured() {
    try {
      parseEncryptionKey(env.MCP_SETTINGS_ENCRYPTION_KEY);
      return true;
    } catch {
      return false;
    }
  }
  function parseImport(markdown: string) {
    try {
      return parseSkillMarkdown(markdown);
    } catch {
      // biome-ignore lint/style/useErrorCause: 导入内容仅返回固定校验提示，不传播原始正文。
      throw new SettingsError(
        400,
        "SKILL.md 格式无效：需要 name、description 和正文，仅支持最多 64 KB 文本，不执行脚本。"
      );
    }
  }
  async function read() {
    const row = await repository.read();
    if (!row) {
      return {
        disabledBuiltinIds: [] as string[],
        revision: 0,
        skills: [] as PersonalSkill[],
      };
    }
    return {
      revision: row.revision,
      ...personalSkillSettingsSchema.parse(
        decryptSettings(
          row.encrypted,
          row.revision,
          parseEncryptionKey(env.MCP_SETTINGS_ENCRYPTION_KEY),
          domain
        )
      ),
    };
  }
  function projection(skill: PersonalSkill): SkillProjection {
    const parsed = parseSkillMarkdown(skill.markdown);
    return {
      description: parsed.description,
      displayName: parsed.metadata?.["display-name"],
      enabled: skill.enabled,
      id: `personal:${skill.id}`,
      name: parsed.name,
      shortDescription: parsed.metadata?.["short-description"],
      source: "personal",
    };
  }
  return {
    async execute(input: SkillAction) {
      const action = skillActionSchema.parse(input);
      if (action.action === "preview") {
        const parsed = parseImport(action.markdown);
        return {
          description: parsed.description,
          displayName: parsed.metadata?.["display-name"],
          markdown: action.markdown,
          name: parsed.name,
          shortDescription: parsed.metadata?.["short-description"],
        };
      }
      const state = await read();
      if (action.action === "read") {
        if (action.id.startsWith("builtin:")) {
          const skill = (await builtins()).find(
            (item) => `builtin:${item.name}` === action.id
          );
          if (!skill) {
            throw new SettingsError(404, "技能不存在。");
          }
          return {
            id: action.id,
            markdown: await readSkillFile(skill, "SKILL.md"),
          };
        }
        const skill = state.skills.find(
          (item) => `personal:${item.id}` === action.id
        );
        if (!skill) {
          throw new SettingsError(404, "技能不存在。");
        }
        return { id: action.id, markdown: skill.markdown };
      }
      if (!configured()) {
        throw new SettingsError(503, "个人技能管理暂未开放，请联系管理员。");
      }
      if (action.revision !== state.revision) {
        throw new SettingsError(
          409,
          "技能配置已更新，请刷新后重试；输入仍保留。"
        );
      }
      const skills = [...state.skills];
      let disabledBuiltinIds = [...state.disabledBuiltinIds];
      if (action.action === "toggle" && action.id.startsWith("builtin:")) {
        if (
          !(await builtins()).some(
            (item) => `builtin:${item.name}` === action.id
          )
        ) {
          throw new SettingsError(404, "内置技能不存在。");
        }
        disabledBuiltinIds = disabledBuiltinIds.filter(
          (id) => id !== action.id
        );
        if (!action.enabled) {
          disabledBuiltinIds.push(action.id);
        }
      } else if (action.action === "save" || action.action === "copy") {
        let candidate: PersonalSkill;
        if (action.action === "copy") {
          const original = (await builtins()).find(
            (item) => `builtin:${item.name}` === action.id
          );
          if (!original) {
            throw new SettingsError(404, "内置技能不存在。");
          }
          const markdown = await readSkillFile(original, "SKILL.md");
          parseSkillMarkdown(markdown);
          candidate = { enabled: true, id: action.newId, markdown };
          if (skills.some((item) => item.id === candidate.id)) {
            throw new SettingsError(409, "个人技能标识已存在。");
          }
        } else {
          parseImport(action.markdown);
          candidate = {
            enabled: action.enabled,
            id: action.id,
            markdown: action.markdown,
          };
        }
        const index = skills.findIndex((item) => item.id === candidate.id);
        if (index < 0) {
          skills.push(candidate);
        } else {
          skills[index] = candidate;
        }
      } else {
        const index = skills.findIndex(
          (item) => item.id === action.id.replace(/^personal:/, "")
        );
        if (index < 0) {
          throw new SettingsError(404, "技能不存在。");
        }
        if (action.action === "delete") {
          skills.splice(index, 1);
        } else {
          skills[index] = { ...skills[index], enabled: action.enabled };
        }
      }
      personalSkillsSchema.parse(skills);
      const revision = state.revision + 1;
      if (
        !(await repository.compareAndSwap(state.revision, {
          encrypted: encryptSettings(
            { disabledBuiltinIds, skills },
            revision,
            parseEncryptionKey(env.MCP_SETTINGS_ENCRYPTION_KEY),
            domain
          ),
          revision,
          updatedAt: new Date(),
          updatedBy: userId,
        }))
      ) {
        throw new SettingsError(
          409,
          "技能配置已更新，请刷新后重试；输入仍保留。"
        );
      }
      return { revision };
    },
    async get() {
      const [state, builtin] = await Promise.all([read(), builtins()]);
      return {
        configured: configured(),
        revision: state.revision,
        skills: [
          ...builtin.map((item) => ({
            ...skillProjection(item),
            enabled: !state.disabledBuiltinIds.includes(`builtin:${item.name}`),
          })),
          ...state.skills.map(projection),
        ],
      };
    },
    load: read,
  };
}

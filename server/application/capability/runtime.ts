import "server-only";
import { createHash } from "node:crypto";
import {
  type RuntimeConfig,
  readRuntimeConfig,
} from "@/server/application/mcp/runtime-config";
import { SettingsError } from "@/server/application/mcp/security";
import { createSettingsService } from "@/server/application/mcp/service";
import {
  type CapabilitySelection,
  parseSkillMarkdown,
  resolveSelection,
  type ScopeSnapshot,
} from "@/server/domain/capability/schema";
import { discoverSkills, type Skill } from "@/server/infrastructure/mcp/skills";
import {
  personalSettingsRepository,
  type ScopeRepository,
  scopeRepository,
} from "@/server/infrastructure/persistence/drizzle/capability-repository";
import { createPersonalSkillsService } from "./personal-skills";

export type CapabilityCatalog = {
  config: RuntimeConfig;
  skills: Skill[];
  grants: Record<string, string>;
};
function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function createPersonalMcpService(userId: string) {
  return createSettingsService({
    cryptoDomain: `personal-mcp:${userId}`,
    repository: personalSettingsRepository(userId, "mcp"),
  });
}
export async function readUserCatalog(user: {
  id: string;
  type: string;
}): Promise<CapabilityCatalog> {
  const [config, builtins, personal, personalSkills] = await Promise.all([
    readRuntimeConfig(),
    discoverSkills(),
    user.type === "regular"
      ? createPersonalMcpService(user.id).loadSnapshot()
      : { revision: 0, servers: [] },
    user.type === "regular"
      ? createPersonalSkillsService({ userId: user.id }).load()
      : { disabledBuiltinIds: [] as string[], revision: 0, skills: [] },
  ]);
  const mcpRevision = personal.revision;
  const servers = [
    ...config.servers.map((server) => ({ ...server, capabilityId: server.id })),
    ...personal.servers
      .filter((server) => server.enabled)
      .map(({ enabled: _, ...server }) => ({
        ...server,
        authorizationVersion: fingerprint([user.id, mcpRevision, server]),
        autoApproveTools: [],
        capabilityId: `personal:${server.id}`,
        id: `personal:${server.id}`,
        managed: true,
        personal: true,
      })),
  ];
  const skills: Skill[] = [
    ...builtins
      .filter(
        (skill) =>
          !personalSkills.disabledBuiltinIds.includes(`builtin:${skill.name}`)
      )
      .map((skill) => ({
        ...skill,
        id: `builtin:${skill.name}`,
        source: "builtin" as const,
      })),
    ...personalSkills.skills
      .filter((skill) => skill.enabled)
      .map((skill) => {
        const parsed = parseSkillMarkdown(skill.markdown);
        return {
          authorizationVersion: fingerprint([
            user.id,
            personalSkills.revision,
            skill,
          ]),
          description: parsed.description,
          directory: "",
          displayName: parsed.metadata?.["display-name"] ?? parsed.name,
          id: `personal:${skill.id}`,
          markdown: skill.markdown,
          name: `personal:${skill.id}`,
          shortDescription: parsed.metadata?.["short-description"],
          source: "personal" as const,
        };
      }),
  ];
  const grants: Record<string, string> = {};
  for (const server of servers) {
    grants[`server:${server.capabilityId}`] =
      server.authorizationVersion ?? fingerprint(server);
  }
  for (const skill of skills) {
    grants[`skill:${skill.id}`] =
      skill.authorizationVersion ??
      fingerprint([personalSkills.revision, skill.id, skill.description]);
  }
  return { config: { ...config, servers }, grants, skills };
}
export function createTaskCapabilityService({
  userId,
  chatId,
  load,
  scopes = scopeRepository,
}: {
  userId: string;
  chatId: string;
  load: () => Promise<CapabilityCatalog>;
  scopes?: ScopeRepository;
}) {
  return {
    async prepare(
      input: CapabilitySelection | undefined,
      continuation: boolean,
      beforeBind?: () => Promise<void>
    ) {
      const [catalog, previous] = await Promise.all([
        load(),
        scopes.read(userId, chatId),
      ]);
      if (continuation && !previous) {
        throw new SettingsError(
          409,
          "此待审批任务缺少服务端原范围，请发送新消息重新确认能力。"
        );
      }
      const requested = continuation
        ? previous?.selection
        : (input ?? previous?.selection);
      let selection: CapabilitySelection;
      try {
        selection = resolveSelection(
          requested,
          catalog.config.servers.map(
            (server) => server.capabilityId ?? server.id
          ),
          catalog.skills.map((skill) => skill.id ?? `builtin:${skill.name}`)
        );
      } catch {
        // biome-ignore lint/style/useErrorCause: 校验原因可能含客户端数据，错误仅返回固定提示。
        throw new SettingsError(
          400,
          "所选能力不存在、已停用或不属于当前账号，请更新本次选择。"
        );
      }
      const grants: Record<string, string> = {};
      for (const id of selection.serverIds) {
        grants[`server:${id}`] = catalog.grants[`server:${id}`];
      }
      for (const id of selection.skillIds) {
        grants[`skill:${id}`] = catalog.grants[`skill:${id}`];
      }
      if (
        continuation &&
        previous &&
        Object.entries(previous.grants).some(
          ([id, version]) => grants[id] !== version
        )
      ) {
        throw new SettingsError(
          409,
          "能力配置已变化，旧审批已失效，请发送新消息确认当前能力。"
        );
      }
      await beforeBind?.();
      const snapshot: ScopeSnapshot =
        continuation && previous
          ? previous
          : await scopes.bind(userId, chatId, previous?.revision ?? 0, {
              grants,
              selection,
            });
      return {
        async assertCurrent(id: string) {
          const [current, available] = await Promise.all([
            scopes.read(userId, chatId),
            load(),
          ]);
          if (
            !current ||
            current.revision !== snapshot.revision ||
            !snapshot.grants[id] ||
            current.grants[id] !== snapshot.grants[id] ||
            available.grants[id] !== snapshot.grants[id]
          ) {
            throw new SettingsError(
              409,
              "本次能力权限已变化，旧调用或审批已失效。"
            );
          }
        },
        config: {
          ...catalog.config,
          servers: catalog.config.servers.filter((server) =>
            selection.serverIds.includes(server.capabilityId ?? server.id)
          ),
        },
        skills: catalog.skills.filter((skill) =>
          selection.skillIds.includes(skill.id ?? `builtin:${skill.name}`)
        ),
        snapshot,
      };
    },
  };
}

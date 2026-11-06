import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { tool } from "ai";
import matter from "gray-matter";
import { z } from "zod";

export type Skill = {
  id?: string;
  source?: "builtin" | "personal";
  markdown?: string;
  authorizationVersion?: string;
  name: string;
  description: string;
  directory: string;
  displayName?: string;
  shortDescription?: string;
};
const metadataSchema = z.object({
  description: z.string().min(1).max(1024),
  metadata: z
    .object({
      "display-name": z.string().min(1).max(80).optional(),
      "short-description": z.string().min(1).max(240).optional(),
    })
    .optional(),
  name: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(64),
});

export async function discoverSkills(
  root = path.join(process.cwd(), "server/infrastructure/skills")
): Promise<Skill[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const canonicalRoot = await realpath(root);
  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (entry) => {
        const directory = await realpath(path.join(root, entry.name));
        if (!directory.startsWith(`${canonicalRoot}${path.sep}`)) {
          throw new Error("Skill directory escapes root");
        }
        const body = await readSkillFile(
          { description: "", directory, name: entry.name },
          "SKILL.md"
        );
        const metadata = metadataSchema.parse(matter(body).data);
        if (metadata.name !== entry.name) {
          throw new Error("Skill name must match its directory");
        }
        return {
          description: metadata.description,
          directory,
          displayName: metadata.metadata?.["display-name"],
          name: metadata.name,
          shortDescription: metadata.metadata?.["short-description"],
        };
      })
  );
  return skills;
}

export async function readSkillFile(skill: Skill, resource: string) {
  if (skill.markdown !== undefined) {
    if (resource !== "SKILL.md") {
      throw new Error("个人技能仅包含 SKILL.md 文本，不支持资源或脚本。");
    }
    return skill.markdown;
  }
  if (
    !resource ||
    path.isAbsolute(resource) ||
    resource.split(/[\\/]/).includes("..")
  ) {
    throw new Error("Only relative skill resource paths are allowed");
  }
  const root = await realpath(skill.directory);
  const target = await realpath(path.resolve(root, resource));
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Resource escapes skill directory");
  }
  if ((await stat(target)).size > 64_000) {
    throw new Error("Skill resource exceeds 64 KB");
  }
  return readFile(target, "utf8");
}

export function buildSkillsPrompt(skills: Skill[]) {
  return `Available skills (metadata only):\n${skills.map((skill) => `- ${skill.name}${skill.displayName ? ` (${skill.displayName})` : ""}: ${skill.description}`).join("\n")}\nLoad a relevant skill before specialized work, using its described scope rather than a tool-name match. Read supporting references only as needed. Simple requests need no skill-loading ceremony. A skill provides a method; it does not supply missing tools, script execution or permissions.`;
}

export function createSkillTools(
  skills: Skill[],
  authorize?: (skill: Skill) => Promise<void>
) {
  const getSkill = (name: string) => {
    const skill = skills.find((item) => item.name === name);
    if (!skill) {
      throw new Error("Unknown skill");
    }
    return skill;
  };
  async function read(name: string, resource: string) {
    const skill = getSkill(name);
    await authorize?.(skill);
    return readSkillFile(skill, resource);
  }
  return {
    loadSkill: tool({
      description:
        "Load the full instructions for a skill from the available catalog.",
      execute: async ({ name }) => ({
        description:
          getSkill(name).shortDescription ?? getSkill(name).description,
        displayName: getSkill(name).displayName ?? name,
        instructions: matter(await read(name, "SKILL.md")).content,
        name,
      }),
      inputSchema: z.object({ name: z.string() }),
    }),
    readSkillResource: tool({
      description:
        "Read a text reference bundled with an available skill. Does not execute scripts.",
      execute: async ({ name, resource }) => ({
        content: await read(name, resource),
        name,
        resource,
      }),
      inputSchema: z.object({ name: z.string(), resource: z.string() }),
    }),
  };
}

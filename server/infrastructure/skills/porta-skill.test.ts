import assert from "node:assert/strict";
import { test } from "node:test";
import matter from "gray-matter";
import {
  buildSkillsPrompt,
  createSkillTools,
  discoverSkills,
  readSkillFile,
} from "@/server/infrastructure/mcp/skills";

test("应用只提供按需相似商品技能；旧技能不保留别名或工具手册副本", async () => {
  const skills = await discoverSkills();
  assert.deepEqual(
    skills.map((skill) => skill.name),
    ["similar-products"]
  );
  assert.equal(skills[0].displayName, "相似检索与比较");
  const body = await readSkillFile(skills[0], "SKILL.md");
  assert.ok(!buildSkillsPrompt(skills).includes(matter(body).content.trim()));
  const active = new Map<string, string>();
  const tools = createSkillTools(skills, undefined, (name, instructions) => {
    active.set(name, instructions);
  });
  assert.equal(active.size, 0, "discovery must not activate a skill");
  const options = { context: {}, messages: [], toolCallId: "similar-products" };
  const loaded = await tools.loadSkill.execute?.(
    { name: "similar-products" },
    options
  );
  assert.ok(loaded && "instructions" in loaded);
  assert.equal(loaded.instructions, matter(body).content);
  assert.equal(active.get("similar-products"), loaded.instructions);
  const denied = new Map<string, string>();
  const deniedTools = createSkillTools(
    skills,
    () => Promise.reject(new Error("not selected")),
    (name, instructions) => denied.set(name, instructions)
  );
  await assert.rejects(
    () =>
      deniedTools.loadSkill.execute?.(
        { name: "similar-products" },
        options
      ) as Promise<unknown>,
    /not selected/
  );
  assert.equal(
    denied.size,
    0,
    "a rejected load must never activate instructions"
  );
  await Promise.all(
    ["porta", "investigate-content", "source-1688"].map((name) =>
      assert.rejects(
        () => tools.loadSkill.execute?.({ name }, options) as Promise<unknown>
      )
    )
  );
});

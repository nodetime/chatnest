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
  assert.equal(skills[0].displayName, "找相似商品");
  const body = await readSkillFile(skills[0], "SKILL.md");
  assert.ok(!buildSkillsPrompt(skills).includes("## 工作方法"));
  const tools = createSkillTools(skills);
  const options = { context: {}, messages: [], toolCallId: "similar-products" };
  const loaded = await tools.loadSkill.execute?.(
    { name: "similar-products" },
    options
  );
  assert.ok(loaded && "instructions" in loaded);
  assert.equal(loaded.instructions, matter(body).content);
  assert.doesNotMatch(body, /askUser|updateTodo|审批|onebound_|porta__/);
  await Promise.all(
    ["porta", "investigate-content", "source-1688"].map((name) =>
      assert.rejects(
        () => tools.loadSkill.execute?.({ name }, options) as Promise<unknown>
      )
    )
  );
});

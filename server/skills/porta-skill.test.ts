import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  createSkillTools,
  discoverSkills,
  readSkillFile,
} from "@/server/agent/skills";

test("bundled Porta skill has pinned provenance and works with the existing host loader", async () => {
  const skills = await discoverSkills();
  const porta = skills.find((skill) => skill.name === "porta");
  assert.ok(porta, "shared Porta skill must be installed, not just described");
  const lock = JSON.parse(
    await readFile(
      path.join(process.cwd(), "server/config/porta-skill.lock.json"),
      "utf8"
    )
  );
  assert.equal(lock.repository, "https://github.com/nodetime/porta");
  assert.match(lock.revision, /^[0-9a-f]{40}$/);
  assert.deepEqual(Object.keys(lock.files).sort(), [
    "SKILL.md",
    "references/cli.md",
    "references/mcp.md",
  ]);
  await Promise.all(
    Object.entries(lock.files).map(async ([resource, hash]) => {
      const body = await readSkillFile(porta, resource);
      assert.equal(createHash("sha256").update(body).digest("hex"), hash);
    })
  );
  const tools = createSkillTools(skills);
  const options = {
    context: {},
    messages: [],
    toolCallId: "test-porta-skill",
  };
  const loaded = await tools.loadSkill.execute?.({ name: "porta" }, options);
  assert.ok(loaded && "instructions" in loaded);
  assert.match(loaded.instructions, /not a fixed/);
  const reference = await tools.readSkillResource.execute?.(
    { name: "porta", resource: "references/mcp.md" },
    options
  );
  assert.ok(reference && "content" in reference);
  assert.match(reference.content, /MCP/);
});

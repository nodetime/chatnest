import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./copy-skills.mjs", import.meta.url));
const roots = { claude: ".claude/skills", codex: ".agents/skills" };
const markdown =
  "---\nname: demo\ndescription: 测试用技能。\n---\n\n# 测试技能\n";

function fixture(context) {
  const root = mkdtempSync(join(tmpdir(), "chatnest-copy-skills-"));
  context.after(() => rmSync(root, { force: true, recursive: true }));
  return root;
}

function skill(root, host, files = {}) {
  const directory = join(root, roots[host], "demo");
  for (const [name, content] of Object.entries({
    "SKILL.md": markdown,
    ...files,
  })) {
    const path = join(directory, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return directory;
}

function run(root, args = [], expectedStatus = 0) {
  const result = spawnSync(
    process.execPath,
    [script, "--root", root, ...args],
    {
      encoding: "utf8",
      timeout: 10_000,
    }
  );
  assert.equal(result.status, expectedStatus, result.stderr);
  return JSON.parse(result.stdout);
}

test("should_compare_without_writing_when_apply_is_absent", (context) => {
  const root = fixture(context);
  skill(root, "claude");
  const report = run(root, ["--from", "claude"]);
  assert.equal(report.items[0].status, "missing");
  assert.equal(existsSync(join(root, roots.codex)), false);
});

test("should_copy_nested_resources_when_target_is_missing", (context) => {
  const root = fixture(context);
  const binary = Buffer.from([0, 255, 128, 42]);
  skill(root, "claude", {
    "assets/data.bin": binary,
    "scripts/task.mjs": "console.log('测试');\n",
  });
  const report = run(root, ["--from", "claude", "--apply"]);
  assert.equal(report.items[0].action, "copied");
  assert.deepEqual(
    readFileSync(join(root, roots.codex, "demo/assets/data.bin")),
    binary
  );
  assert.equal(
    readFileSync(join(root, roots.codex, "demo/scripts/task.mjs"), "utf8"),
    "console.log('测试');\n"
  );
});

test("should_copy_to_claude_when_source_is_codex", (context) => {
  const root = fixture(context);
  skill(root, "codex");
  run(root, ["--from", "codex", "--apply"]);
  assert.equal(
    readFileSync(join(root, roots.claude, "demo/SKILL.md"), "utf8"),
    markdown
  );
});

test("should_skip_identical_skill_when_both_sides_match", (context) => {
  const root = fixture(context);
  skill(root, "claude");
  skill(root, "codex");
  const report = run(root, ["--from", "claude", "--apply"]);
  assert.equal(report.items[0].status, "same");
  assert.equal(report.items[0].action, "skipped");
});

test("should_preserve_target_when_files_conflict_without_overwrite", (context) => {
  const root = fixture(context);
  skill(root, "claude");
  const target = skill(root, "codex", { "SKILL.md": "目标独立修改\n" });
  const report = run(root, ["--from", "claude", "--apply"], 2);
  assert.equal(report.items[0].status, "different");
  assert.equal(report.items[0].changes[0].path, "SKILL.md");
  assert.equal(
    readFileSync(join(target, "SKILL.md"), "utf8"),
    "目标独立修改\n"
  );
});

test("should_preserve_target_extras_when_overwrite_is_explicit", (context) => {
  const root = fixture(context);
  skill(root, "claude");
  const target = skill(root, "codex", {
    "notes.txt": "仅目标存在\n",
    "SKILL.md": "旧版本\n",
  });
  run(root, ["--from", "claude", "--apply", "--overwrite"]);
  assert.equal(readFileSync(join(target, "SKILL.md"), "utf8"), markdown);
  assert.equal(readFileSync(join(target, "notes.txt"), "utf8"), "仅目标存在\n");
});

test("should_report_target_only_skills_when_copying_all", (context) => {
  const root = fixture(context);
  mkdirSync(join(root, roots.claude), { recursive: true });
  skill(root, "codex");
  const report = run(root, ["--from", "claude", "--apply"]);
  assert.equal(report.items[0].status, "target-only");
  assert.equal(existsSync(join(root, roots.codex, "demo/SKILL.md")), true);
});

test("should_copy_selected_skill_when_name_is_provided", (context) => {
  const root = fixture(context);
  skill(root, "claude");
  const other = join(root, roots.claude, "other");
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, "SKILL.md"), markdown.replace("demo", "other"));
  run(root, ["--from", "claude", "--skill", "demo", "--apply"]);
  assert.equal(existsSync(join(root, roots.codex, "demo/SKILL.md")), true);
  assert.equal(existsSync(join(root, roots.codex, "other")), false);
});

test("should_reject_path_traversal_when_skill_name_escapes_directory", (context) => {
  const root = fixture(context);
  skill(root, "claude");
  const result = spawnSync(
    process.execPath,
    [
      script,
      "--root",
      root,
      "--from",
      "claude",
      "--skill",
      "../outside",
      "--apply",
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /技能名/);
  assert.equal(existsSync(join(root, roots.codex)), false);
});

test("should_reject_linked_resources_when_source_contains_a_junction", (context) => {
  const root = fixture(context);
  const source = skill(root, "claude");
  const external = join(root, "external");
  mkdirSync(external);
  writeFileSync(join(external, "data.txt"), "不应复制\n");
  symlinkSync(external, join(source, "references"), "junction");
  const result = spawnSync(
    process.execPath,
    [script, "--root", root, "--from", "claude", "--apply"],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /链接/);
  assert.equal(existsSync(join(root, roots.codex)), false);
});

test("should_reject_linked_host_directory_when_target_parent_is_a_junction", (context) => {
  const root = fixture(context);
  skill(root, "claude");
  const external = join(root, "external");
  mkdirSync(external);
  symlinkSync(external, join(root, ".agents"), "junction");
  const result = spawnSync(
    process.execPath,
    [script, "--root", root, "--from", "claude", "--apply"],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /链接/);
  assert.equal(existsSync(join(external, "skills")), false);
});

test("should_reject_sensitive_files_before_any_copy_when_source_contains_env", (context) => {
  const root = fixture(context);
  skill(root, "claude", { ".env": "测试占位内容\n" });
  const result = spawnSync(
    process.execPath,
    [script, "--root", root, "--from", "claude", "--apply"],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /敏感文件/);
  assert.equal(existsSync(join(root, roots.codex)), false);
});

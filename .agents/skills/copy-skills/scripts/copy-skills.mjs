import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const skillRoots = { claude: ".claude/skills", codex: ".agents/skills" };
const ignoredDirectories = new Set([".git", "node_modules", "__pycache__"]);
const sensitiveName =
  /^(?:\.env(?:\..*)?|.*\.(?:pem|key)|(?:credentials|secrets)(?:\..*)?)$/i;

function assertDirectory(path) {
  const entry = lstatSync(path);
  if (entry.isSymbolicLink()) {
    throw new Error(`不复制或覆盖链接，请先检查其真实目标：${path}`);
  }
  if (!entry.isDirectory()) {
    throw new Error(`目标不是目录：${path}`);
  }
}

function listSkills(path) {
  if (!existsSync(path)) {
    return [];
  }
  assertDirectory(path);
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(path, name, "SKILL.md")));
}

function readTree(directory) {
  assertDirectory(directory);
  const files = new Map();
  const directories = new Set();
  function visit(relativePath) {
    const path = join(directory, relativePath);
    const entry = lstatSync(path);
    if (entry.isSymbolicLink()) {
      throw new Error(`技能包含链接，未执行复制：${path}`);
    }
    if (entry.isDirectory()) {
      directories.add(relativePath);
      for (const name of readdirSync(path).sort()) {
        if (!ignoredDirectories.has(name)) {
          visit(relativePath ? `${relativePath}/${name}` : name);
        }
      }
      return;
    }
    if (!entry.isFile()) {
      throw new Error(`技能包含不支持的文件类型：${path}`);
    }
    if (sensitiveName.test(relativePath.split("/").at(-1))) {
      throw new Error(`技能包含敏感文件，未执行复制：${path}`);
    }
    const content = readFileSync(path);
    files.set(relativePath, {
      content,
      hash: createHash("sha256").update(content).digest("hex"),
      mode: entry.mode,
    });
  }
  visit("");
  if (!files.has("SKILL.md")) {
    throw new Error(`技能缺少 SKILL.md：${directory}`);
  }
  return { directories, files };
}

function planSkill(name, sourceRoot, targetRoot) {
  const sourcePath = join(sourceRoot, name);
  const targetPath = join(targetRoot, name);
  if (!existsSync(sourcePath)) {
    return { changes: [], name, status: "target-only", targetPath };
  }
  const source = readTree(sourcePath);
  if (!existsSync(targetPath)) {
    return {
      changes: [...source.files.keys()].map((path) => ({
        path,
        status: "source-only",
      })),
      name,
      source,
      status: "missing",
      targetPath,
    };
  }
  const target = readTree(targetPath);
  for (const path of source.directories) {
    if (target.files.has(path)) {
      throw new Error(
        `文件与目录类型冲突，未执行复制：${join(targetPath, path)}`
      );
    }
  }
  for (const path of source.files.keys()) {
    if (target.directories.has(path)) {
      throw new Error(
        `文件与目录类型冲突，未执行复制：${join(targetPath, path)}`
      );
    }
  }
  const paths = [
    ...new Set([...source.files.keys(), ...target.files.keys()]),
  ].sort();
  const changes = paths.flatMap((path) => {
    if (!source.files.has(path)) {
      return [{ path, status: "target-only" }];
    }
    if (!target.files.has(path)) {
      return [{ path, status: "source-only" }];
    }
    return source.files.get(path).hash === target.files.get(path).hash
      ? []
      : [{ path, status: "different" }];
  });
  const sourceChanged = changes.some(
    (change) => change.status !== "target-only"
  );
  let status = "same";
  if (sourceChanged) {
    status = "different";
  } else if (changes.length) {
    status = "target-extra";
  }
  return { changes, name, source, status, targetPath };
}

function copyTree(source, targetPath) {
  for (const path of source.directories) {
    mkdirSync(join(targetPath, path), { recursive: true });
  }
  for (const [path, file] of source.files) {
    const target = join(targetPath, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
    // POSIX 脚本需要保留执行位；Windows 不以 POSIX 权限位判断复制成功。
    if (process.platform !== "win32") {
      chmodSync(target, file.mode);
    }
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      apply: { default: false, type: "boolean" },
      from: { type: "string" },
      help: { default: false, type: "boolean" },
      overwrite: { default: false, type: "boolean" },
      root: { default: process.cwd(), type: "string" },
      skill: { type: "string" },
    },
  });
  if (values.help) {
    console.log(
      "用法：node copy-skills.mjs --from claude|codex [--root 项目路径] [--skill 名称] [--apply] [--overwrite]"
    );
    console.log(
      "默认只比对；--apply 复制；--overwrite 明确允许覆盖差异文件，不删除目标独有内容。"
    );
    return;
  }
  if (!Object.hasOwn(skillRoots, values.from ?? "")) {
    throw new Error("请用 --from claude 或 --from codex 明确源端。");
  }
  if (values.overwrite && !values.apply) {
    throw new Error("--overwrite 必须与 --apply 一起使用。");
  }
  if (values.skill && !/^[a-z0-9][a-z0-9_-]*$/.test(values.skill)) {
    throw new Error(
      "技能名只允许小写字母、数字、连字符和下划线，不能包含路径。"
    );
  }
  const root = resolve(values.root);
  const { from } = values;
  const to = from === "claude" ? "codex" : "claude";
  const sourceRoot = join(root, skillRoots[from]);
  const targetRoot = join(root, skillRoots[to]);
  if (!existsSync(sourceRoot)) {
    throw new Error(`源技能目录不存在：${sourceRoot}`);
  }
  for (const directory of [dirname(sourceRoot), dirname(targetRoot)]) {
    if (existsSync(directory)) {
      assertDirectory(directory);
    }
  }
  const sourceNames = listSkills(sourceRoot);
  const targetNames = listSkills(targetRoot);
  if (values.skill && !sourceNames.includes(values.skill)) {
    throw new Error(`源端不存在该技能或缺少 SKILL.md：${values.skill}`);
  }
  const names = values.skill
    ? [values.skill]
    : [...new Set([...sourceNames, ...targetNames])].sort();
  // 全部预检完成后才写文件，避免后面的非法技能使前面的技能被意外部分复制。
  const plans = names.map((name) => planSkill(name, sourceRoot, targetRoot));
  let conflicts = 0;
  const items = plans.map((plan) => {
    let action = "compared";
    if (values.apply) {
      action = "skipped";
      if (plan.status === "different" && !values.overwrite) {
        action = "conflict";
        conflicts += 1;
      } else if (plan.status === "missing" || plan.status === "different") {
        copyTree(plan.source, plan.targetPath);
        action = "copied";
      }
    }
    return {
      action,
      changes: plan.changes,
      name: plan.name,
      status: plan.status,
    };
  });
  console.log(
    JSON.stringify({ apply: values.apply, conflicts, from, items, to }, null, 2)
  );
  if (conflicts) {
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}

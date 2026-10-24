#!/usr/bin/env node
// P0 目录收敛:git mv + 全仓 import 重写。零依赖,幂等(源不存在即跳过)。
// 用法: node scripts/migrate-paths.mjs --batch ui|core|domains|shared|deploy
//       node scripts/migrate-paths.mjs --plan
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// 目录/文件级搬运映射(相对仓库根,无尾斜杠)
const MOVES = {
  // ui
  "components": "app/_components",
  "hooks": "app/_hooks",
  "lib/editor": "app/_lib/editor",
  "lib/utils.ts": "app/_lib/utils.ts",
  "lib/types.ts": "app/_lib/types.ts",
  "lib/constants.ts": "app/_lib/constants.ts",
  // core
  "lib/db": "server/db",
  "lib/ai": "server/ai",
  "lib/agent": "server/agent",
  "skills": "server/skills",
  "config": "server/config",
  // domains
  "lib/uploads": "server/uploads",
  "lib/admin": "server/admin",
  "lib/artifacts": "server/artifacts",
  "artifacts/code/client.tsx": "app/_artifacts/code/client.tsx",
  "artifacts/text/client.tsx": "app/_artifacts/text/client.tsx",
  "artifacts/sheet/client.tsx": "app/_artifacts/sheet/client.tsx",
  "artifacts/image/client.tsx": "app/_artifacts/image/client.tsx",
  "artifacts/actions.ts": "app/_artifacts/actions.ts",
  "artifacts/code/server.ts": "server/artifacts/code/server.ts",
  "artifacts/text/server.ts": "server/artifacts/text/server.ts",
  "artifacts/sheet/server.ts": "server/artifacts/sheet/server.ts",
  // shared
  "lib/errors.ts": "server/shared/errors.ts",
  "lib/ratelimit.ts": "server/shared/ratelimit.ts",
  "lib/auth-cookies.ts": "server/shared/auth-cookies.ts",
  // deploy
  "vercel-template.json": "deploy/vercel-template.json",
  ".env.example": "deploy/.env.example",
};

// 单测就近搬迁(文件级)
const TEST_MOVES = {
  "tests/unit/agent.test.ts": "server/agent/agent.test.ts",
  "tests/unit/message-turn.test.ts": "server/agent/message-turn.test.ts",
  "tests/unit/browser.test.ts": "server/agent/browser.test.ts",
  "tests/unit/browser-runtime.test.ts": "server/agent/browser-runtime.test.ts",
  "tests/unit/porta.test.ts": "server/agent/porta.test.ts",
  "tests/unit/porta-errors.test.ts": "server/agent/porta-errors.test.ts",
  "tests/unit/mcp-settings-api.test.ts": "server/agent/mcp-settings/mcp-settings-api.test.ts",
  "tests/unit/mcp-settings-build.test.ts": "server/agent/mcp-settings/mcp-settings-build.test.ts",
  "tests/unit/mcp-settings-editor.test.ts": "server/agent/mcp-settings/mcp-settings-editor.test.ts",
  "tests/unit/mcp-settings-general-ui.test.ts": "server/agent/mcp-settings/mcp-settings-general-ui.test.ts",
  "tests/unit/mcp-settings-lifecycle.test.ts": "server/agent/mcp-settings/mcp-settings-lifecycle.test.ts",
  "tests/unit/mcp-settings-runtime.test.ts": "server/agent/mcp-settings/mcp-settings-runtime.test.ts",
  "tests/unit/mcp-settings-security.test.ts": "server/agent/mcp-settings/mcp-settings-security.test.ts",
  "tests/unit/mcp-settings-service.test.ts": "server/agent/mcp-settings/mcp-settings-service.test.ts",
  "tests/unit/ai-telemetry.test.ts": "server/ai/ai-telemetry.test.ts",
  "tests/unit/model-connection.test.ts": "server/ai/model-connection.test.ts",
  "tests/unit/openai-inline-images.test.ts": "server/ai/openai-inline-images.test.ts",
  "tests/unit/platform-admin-separation.test.ts": "server/admin/platform-admin-separation.test.ts",
  "tests/unit/private-uploads.test.ts": "server/uploads/private-uploads.test.ts",
  "tests/unit/document-ingestion.test.ts": "server/uploads/document-ingestion.test.ts",
  "tests/unit/regeneration-db.test.ts": "server/db/regeneration-db.test.ts",
  "tests/unit/result-table.test.ts": "server/artifacts/result-table.test.ts",
  "tests/unit/branding.test.ts": "app/branding.test.ts",
  "tests/unit/admin-template.test.ts": "app/_components/admin/admin-template.test.ts",
  "tests/unit/chat-layout.test.ts": "app/_components/chat/chat-layout.test.ts",
  "tests/unit/workbench-ui.test.ts": "app/_components/chat/workbench-ui.test.ts",
  "tests/unit/activity-groups.test.ts": "app/_components/chat/activity-groups.test.ts",
  "tests/unit/tool-records.test.ts": "app/_components/chat/tool-records.test.ts",
  "tests/unit/unified-tools.test.ts": "app/_components/chat/unified-tools.test.ts",
  "tests/unit/runtime-interactions.test.ts": "app/_components/chat/runtime-interactions.test.ts",
  "tests/unit/vercel-workbench.test.ts": "app/_components/chat/vercel-workbench.test.ts",
  "tests/unit/text-editor-lifecycle.test.ts": "app/_components/chat/text-editor-lifecycle.test.ts",
  "tests/unit/task-experience.test.ts": "app/_components/chat/task-experience.test.ts",
};

const BATCHES = {
  ui: ["components", "hooks", "lib/editor", "lib/utils.ts", "lib/types.ts", "lib/constants.ts"],
  core: ["lib/db", "lib/ai", "lib/agent", "skills", "config"],
  domains: ["lib/uploads", "lib/admin", "lib/artifacts",
    "artifacts/code/client.tsx", "artifacts/text/client.tsx", "artifacts/sheet/client.tsx",
    "artifacts/image/client.tsx", "artifacts/actions.ts",
    "artifacts/code/server.ts", "artifacts/text/server.ts", "artifacts/sheet/server.ts"],
  shared: ["lib/errors.ts", "lib/ratelimit.ts", "lib/auth-cookies.ts", "@tests"],
  deploy: ["vercel-template.json", ".env.example"],
};

const ALL_MOVES = { ...MOVES, ...TEST_MOVES };
// 别名重写规则:按旧路径长度降序,先匹配更长前缀(from/to 都去扩展名,specifier 无扩展名)
const ALIAS_RULES = Object.entries(ALL_MOVES)
  .map(([o, n]) => ({
    from: `@/${o.replace(/\.(ts|tsx)$/, "")}`,
    to: `@/${n.replace(/\.(ts|tsx)$/, "")}`,
  }))
  .sort((a, b) => b.from.length - a.from.length);
// 反查:新路径 -> 旧路径(处理被搬文件的相对导入)
const REVERSE = Object.entries(ALL_MOVES)
  .sort((a, b) => b[1].length - a[1].length);

function gitMv(oldRel, newRel) {
  if (!existsSync(path.join(ROOT, oldRel))) { console.log(`[skip] ${oldRel}`); return false; }
  mkdirSync(path.dirname(path.join(ROOT, newRel)), { recursive: true });
  execSync(`git mv ${JSON.stringify(oldRel)} ${JSON.stringify(newRel)}`, { cwd: ROOT, stdio: "inherit" });
  return true;
}

function oldLocationOf(newRel) {
  for (const [o, n] of REVERSE) {
    if (newRel === n || newRel.startsWith(n + "/")) return o + newRel.slice(n.length);
  }
  return null;
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", ".next", ".local-review"].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|cjs|mjs)$/.test(entry.name)) yield p;
  }
}

const SPEC_RE = /((?:\bfrom\s*\(?|\brequire\s*\(\s*|\bimport\s*\(?\s*)["'])([^"']+)(["'])/g;
let rewriteCount = 0;

function mapAlias(spec) {
  for (const r of ALIAS_RULES) if (spec === r.from || spec.startsWith(r.from + "/")) {
    return r.to + spec.slice(r.from.length);
  }
  return null;
}
function mapOldTarget(oldTarget) {
  for (const [o, n] of Object.entries(ALL_MOVES).sort((a, b) => b[0].length - a[0].length)) {
    const oNoExt = o.replace(/\.(ts|tsx)$/, "");
    if (oldTarget === oNoExt || oldTarget.startsWith(oNoExt + "/")) {
      const tail = oldTarget.slice(oNoExt.length);
      return (n.replace(/\.(ts|tsx)$/, "")) + tail;
    }
  }
  return null;
}

function rewriteImports(fileAbs) {
  const rel = path.relative(ROOT, fileAbs).replaceAll("\\", "/");
  const oldRel = oldLocationOf(rel);
  let text = readFileSync(fileAbs, "utf8");
  let changed = false;
  text = text.replace(SPEC_RE, (m, pre, spec, post) => {
    if (spec.startsWith("@/")) {
      const mapped = mapAlias(spec);
      if (mapped) { changed = true; rewriteCount++; return pre + mapped + post; }
      return m;
    }
    if (spec.startsWith(".") && oldRel) {
      const oldDir = path.dirname(oldRel);
      const oldTarget = path.posix.normalize(path.posix.join(oldDir, spec)).replace(/\.(ts|tsx)$/, "");
      const mapped = mapOldTarget(oldTarget);
      if (mapped) { changed = true; rewriteCount++; return pre + `@/${mapped}` + post; }
    }
    return m;
  });
  if (changed) writeFileSync(fileAbs, text);
}

const args = process.argv.slice(2);
const planOnly = args.includes("--plan");
const batchFlag = args.find((a) => a.startsWith("--batch"));
const batchName = batchFlag?.split("=")[1] ?? args[args.indexOf(batchFlag) + 1];
const keys = planOnly ? Object.keys(MOVES).concat("@tests") : BATCHES[batchName];
if (!keys) { console.error("用法: --batch ui|core|domains|shared|deploy 或 --plan"); process.exit(1); }

console.log(`== batch: ${planOnly ? "PLAN(all)" : batchName} ==`);
for (const key of keys) {
  if (key === "@tests") {
    for (const [o, n] of Object.entries(TEST_MOVES)) {
      if (planOnly) { console.log(`[plan] ${o} -> ${n}`); continue; }
      gitMv(o, n);
    }
    continue;
  }
  if (planOnly) { console.log(`[plan] ${key} -> ${MOVES[key]}`); continue; }
  gitMv(key, MOVES[key]);
}
if (planOnly) process.exit(0);

console.log("== rewrite imports ==");
for (const dir of ["app", "server", "tests", "scripts", "lib", "artifacts"]) {
  if (!existsSync(path.join(ROOT, dir))) continue;
  for (const f of walk(path.join(ROOT, dir))) rewriteImports(f);
}
for (const f of ["next.config.ts", "proxy.ts", "drizzle.config.ts", "playwright.config.ts", "instrumentation.ts", "instrumentation-client.ts"]) {
  const p = path.join(ROOT, f);
  if (existsSync(p)) rewriteImports(p);
}
console.log(`rewrote ${rewriteCount} specifiers`);

// 收尾自检:别名引用不应再指向旧顶层(纯 Node 实现,跨平台,不依赖 shell)
const LEFTOVER_RE = /@\/(lib|components|hooks|artifacts)\//;
let leftover = "";
for (const dir of ["app", "server", "tests", "scripts"]) {
  if (!existsSync(path.join(ROOT, dir))) continue;
  for (const f of walk(path.join(ROOT, dir))) {
    if (LEFTOVER_RE.test(readFileSync(f, "utf8"))) leftover += `${path.relative(ROOT, f)}\n`;
  }
}
console.log(leftover ? `[WARN] 残留旧别名引用:\n${leftover}` : "[OK] 无残留旧别名引用");

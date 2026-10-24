# P0 目录收敛实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把一级目录收敛为 `app server public docs deploy tests scripts`,纯搬运零行为变更。

**Architecture:** 五个批次依次搬运(components/hooks/_lib -> app 下;db/ai/agent/skills/config、uploads/admin/artifacts、shared -> server 下;tests 就近;deploy 收尾),每批"脚本搬运 + 全仓 import 重写 + tsc/单测绿 + 提交",批内原子、批间可回滚。

**Tech Stack:** Node ESM 迁移脚本(零依赖)+ git mv + tsc --noEmit + node:test(经 tsx)。

**Spec:** docs/superpowers/specs/2026-10-24-governance-and-convergence-design.md(第三节 P0 v2 映射)

## Global Constraints(每个任务隐含遵守)

- 禁止 `pnpm build`(会执行数据库迁移);验证一律 `pnpm exec tsc --noEmit` + 离线单测。
- 离线单测命令固定:`pnpm exec tsx --test --test-concurrency=1 --conditions=react-server $(grep -v '^#' scripts/ci/offline-tests.txt | tr '\n' ' ')`。
- 不做付费模型/供应商调用;不动任何业务逻辑;P0 只搬文件与改路径。
- `app/`、`public/`、根级 `next.config.ts`/`proxy.ts`/`instrumentation*.ts`/`vercel.json`/`components.json`/`tsconfig.json`/`playwright.config.ts`/`scripts/` 位置不动(components.json 内容要改)。
- Git:Conventional Commits 中文信息,作者 codeYang,无任何 AI 署名;每批一个 commit。
- 改完结构必须同步 `docs/CODEBASE_MAP.md`(Task 7)。

---

### Task 1: 分支与基线

**Files:** 无新增;产出 `.local-review/p0-baseline.md`(gitignored)。

**Interfaces:** Produces: 分支 `feat/p0-directory-convergence`;基线记录(后续任务对比用)。

- [ ] **Step 1: 确认工作区干净、停掉 dev 服务**

```bash
git status --porcelain   # 必须为空(除 .local-review 等忽略项)
```
若有后台 dev server 在跑(127.0.0.1:3003),先停掉再继续。

- [ ] **Step 2: 建分支**

```bash
git checkout -b feat/p0-directory-convergence
```

- [ ] **Step 3: 类型基线**

```bash
pnpm exec tsc --noEmit && echo TYPE_BASELINE_PASS
```
Expected: 无输出错误,打印 PASS。

- [ ] **Step 4: 离线单测基线**

Run: 全局约束里的离线单测命令。
Expected: 31 个套件全过(约 288 项)。把通过数记入 `.local-review/p0-baseline.md`。

- [ ] **Step 5: e2e 基线(允许已有失败,只记录)**

```bash
PLAYWRIGHT=True pnpm exec playwright test --reporter=line 2>&1 | tail -5
```
把通过/失败数记入 `.local-review/p0-baseline.md`。失败若在搬迁前就存在,不属于本 PR 范围。

---

### Task 2: 迁移脚本

**Files:**
- Create: `scripts/migrate-paths.mjs`

**Interfaces:** Produces: `node scripts/migrate-paths.mjs --batch <ui|core|domains|shared|deploy>`(幂等,已搬过的自动跳过)与 `--plan`(只打印不动文件)。

- [ ] **Step 1: 写入脚本(完整内容如下,逐字使用)**

```js
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

const EXTS = ["", ".ts", ".tsx", ".js", ".cjs", ".mjs", "/index.ts", "/index.tsx"];
function resolveExists(p) {
  for (const e of EXTS) if (existsSync(path.join(ROOT, p + e))) return p + e;
  return null;
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
```

- [ ] **Step 2: 校验脚本语法与计划输出**

```bash
node --check scripts/migrate-paths.mjs && node scripts/migrate-paths.mjs --plan | head -20
```
Expected: 语法通过;计划输出含 `components -> app/_components` 等映射。

- [ ] **Step 3: 提交**

```bash
git add scripts/migrate-paths.mjs
git commit -m "chore: 添加P0目录收敛迁移脚本"
```

---

### Task 3: Batch ui(components/hooks/lib 前端部分 -> app/)

**Files:**
- Modify: `components.json`(aliases)、`biome.jsonc`(files.includes 排除路径)
- Move: components/ hooks/ lib/{editor,utils.ts,types.ts,constants.ts}(脚本执行)

**Interfaces:** Produces: `@/app/_components`、`@/app/_hooks`、`@/app/_lib` 别名生效;后续任务可引用。

- [ ] **Step 1: 执行搬运**

```bash
node scripts/migrate-paths.mjs --batch ui
```
Expected: git mv 成功,末尾 `[OK] 无残留旧别名引用`,rewrote 数 > 0。

- [ ] **Step 2: 改 components.json aliases**

```json
"aliases": {
  "components": "@/app/_components",
  "utils": "@/app/_lib/utils",
  "ui": "@/app/_components/ui",
  "lib": "@/app/_lib",
  "hooks": "@/app/_hooks"
}
```
(tailwind.css 的 `app/globals.css` 不动。)

- [ ] **Step 3: 改 biome.jsonc files.includes**

```jsonc
"includes": [
  "**/*",
  "!app/_components/ai-elements",
  "!app/_components/elements",
  "!app/_components/ui",
  "!app/_lib/utils.ts",
  "!app/_hooks/use-mobile.ts"
]
```

- [ ] **Step 4: 类型 + 离线单测验收**

```bash
pnpm exec tsc --noEmit && echo TSC_PASS
pnpm exec tsx --test --test-concurrency=1 --conditions=react-server $(grep -v '^#' scripts/ci/offline-tests.txt | tr '\n' ' ') 2>&1 | tail -3
```
Expected: TSC_PASS;31 套件全过(与基线一致)。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "refactor: 收敛UI目录到app/_components与_app_hooks_lib"
```

---

### Task 4: Batch core(lib/{db,ai,agent} + skills + config -> server/)

**Files:**
- Modify: `drizzle.config.ts:13-14`、`package.json:7,13`、`next.config.ts:55-58`、`server/agent/config.ts`(原 lib/agent/config.ts:94)、`server/agent/skills.ts`(原 lib/agent/skills.ts:29)

- [ ] **Step 1: 执行搬运**

```bash
node scripts/migrate-paths.mjs --batch core
```

- [ ] **Step 2: drizzle.config.ts 两处路径**

`out: "./lib/db/migrations"` -> `out: "./server/db/migrations"`;`schema: "./lib/db/schema.ts"` -> `schema: "./server/db/schema.ts"`。

- [ ] **Step 3: package.json 两个脚本**

`"build": "tsx lib/db/migrate && next build"` -> `"build": "tsx server/db/migrate && next build"`;
`"db:migrate": "npx tsx lib/db/migrate.ts"` -> `"db:migrate": "npx tsx server/db/migrate.ts"`。

- [ ] **Step 4: next.config.ts tracing 三处**

`"/api/agent"` 与 `"/api/chat"` 条目里的 `"./config/agent.json"` -> `"./server/config/agent.json"`、`"./skills/**/*"` -> `"./server/skills/**/*"`;`"/api/agent/mcp"` 条目里 `"./config/agent.json"` 同改。

- [ ] **Step 5: 两处 process.cwd() 字面量**

`server/agent/config.ts` 中 `path.join(process.cwd(), "config/agent.json")` -> `path.join(process.cwd(), "server/config/agent.json")`;
`server/agent/skills.ts` 中 `path.join(process.cwd(), "skills")` -> `path.join(process.cwd(), "server/skills")`。

- [ ] **Step 6: 验收(含迁移幂等确认)**

```bash
pnpm db:migrate   # 应输出 Migrations completed(证明 drizzle.config 新路径生效)
pnpm exec tsc --noEmit && echo TSC_PASS
pnpm exec tsx --test --test-concurrency=1 --conditions=react-server $(grep -v '^#' scripts/ci/offline-tests.txt | tr '\n' ' ') 2>&1 | tail -3
```
Expected: 迁移完成;TSC_PASS;31 套件全过。

- [ ] **Step 7: 提交**

```bash
git add -A && git commit -m "refactor: 收敛服务端核心到server并更新配置路径"
```

---

### Task 5: Batch domains(uploads/admin/artifacts -> server/;artifacts 客户端 -> app/_artifacts/)

**Files:**
- Modify: `next.config.ts`(worker 路径两处)、`server/uploads/document-parser.ts`(原 lib/uploads/document-parser.ts:43)

- [ ] **Step 1: 执行搬运**

```bash
node scripts/migrate-paths.mjs --batch domains
```
注意:`lib/artifacts -> server/artifacts` 与 `artifacts/<kind>/server.ts -> server/artifacts/<kind>/server.ts` 同批合并,根级 `artifacts/` 搬空后应仅剩目录壳,确认 `ls artifacts` 为空后 `rmdir artifacts`。

- [ ] **Step 2: next.config.ts worker 路径两处**

outputFileTracingIncludes 里 `"/api/files/upload"` 的 `"./lib/uploads/document-worker.cjs"` -> `"./server/uploads/document-worker.cjs"`;
底部 nodeFileTrace 入参 `["lib/uploads/document-worker.cjs", ...]` -> `["server/uploads/document-worker.cjs", ...]`。

- [ ] **Step 3: document-parser.ts worker 路径字面量**

`join(process.cwd(), "lib/uploads/document-worker.cjs")` -> `join(process.cwd(), "server/uploads/document-worker.cjs")`。

- [ ] **Step 4: 验收 + dev 冒烟**

```bash
pnpm exec tsc --noEmit && echo TSC_PASS
pnpm exec tsx --test --test-concurrency=1 --conditions=react-server $(grep -v '^#' scripts/ci/offline-tests.txt | tr '\n' ' ') 2>&1 | tail -3
pnpm dev --hostname 127.0.0.1 --port 3003 &   # 后台起,Ready 后 curl -s http://127.0.0.1:3003/ping 应为 pong,然后杀掉
```
Expected: TSC_PASS;31 套件全过;/ping 返回 pong。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "refactor: 收敛uploads_admin_artifacts到server并拆分产物客户端"
```

---

### Task 6: Batch shared + tests 就近

**Files:**
- Modify: `scripts/ci/offline-tests.txt`(31 条路径)、`scripts/ci/offline-checks.test.mjs:81`(硬编码断言)

- [ ] **Step 1: 执行搬运**

```bash
node scripts/migrate-paths.mjs --batch shared
```

- [ ] **Step 2: 重写 offline-tests.txt**

保留首行注释,31 条 `tests/unit/xxx.test.ts` 按脚本 TEST_MOVES 同名映射为新路径(如 `server/agent/mcp-settings/mcp-settings-api.test.ts`、`app/_components/chat/runtime-interactions.test.ts`)。browser-runtime 与 regeneration-db 本就不在清单,不添加。

- [ ] **Step 3: 改 offline-checks.test.mjs:81 断言**

`assert.ok(args.includes("tests/unit/runtime-interactions.test.ts"));` -> `assert.ok(args.includes("app/_components/chat/runtime-interactions.test.ts"));`

- [ ] **Step 4: 清空 lib/ 壳**

```bash
ls lib 2>/dev/null && rmdir lib 2>/dev/null || echo "lib gone or not empty(check)"
```
若 lib 仍有文件,列出并确认是否遗漏映射(预期:空,可删)。

- [ ] **Step 5: 验收(单测从新位置跑,同时验证契约自测)**

```bash
node --test scripts/ci/offline-checks.test.mjs 2>&1 | tail -3
pnpm exec tsc --noEmit && echo TSC_PASS
pnpm exec tsx --test --test-concurrency=1 --conditions=react-server $(grep -v '^#' scripts/ci/offline-tests.txt | tr '\n' ' ') 2>&1 | tail -3
```
Expected: 契约自测过;TSC_PASS;31 套件全过。

- [ ] **Step 6: 提交**

```bash
git add -A && git commit -m "refactor: shared入server并就近搬迁单元测试"
```

---

### Task 7: Batch deploy + 文档同步

**Files:**
- Move: vercel-template.json、.env.example -> deploy/(脚本执行)
- Modify: `AGENTS.md`、`docs/CODEBASE_MAP.md`、`README.md`、`DEVELOPMENT.md`

- [ ] **Step 1: 执行搬运**

```bash
node scripts/migrate-paths.mjs --batch deploy
```

- [ ] **Step 2: 删除 .cursor/(用户 2026-10-24 指示)**

`.cursor/` 下仅有 `rules/ultracite.mdc`(ultracite 自动生成的 Cursor 规则,与 Biome 实际执行的 lint 完全重复,真源是 `pnpm check`)。AGENTS.md 已统一双工具指令源,删除:

```bash
git rm -r .cursor 2>/dev/null || rm -rf .cursor   # 若未被 git 跟踪则直接删
```

- [ ] **Step 3: AGENTS.md 更新目录段**

"目录(收敛过渡态)"一节改为已收敛状态:目标目录已落地,删除"按现状目录工作"的过渡提示;启动序列与约束不变。

- [ ] **Step 4: CODEBASE_MAP.md 路径替换**

全量把旧路径替换为新路径:`lib/` 前缀按 MOVES 映射、`components/` -> `app/_components/`、`hooks/` -> `app/_hooks/`、`artifacts/<kind>/client` -> `app/_artifacts/...`、顶层 `artifacts/<kind>/server` -> `server/artifacts/...`。逐条过,不许漏(此文件是权威地图)。

- [ ] **Step 5: README.md / DEVELOPMENT.md**

涉及 `lib/db/migrate`、`.env.example`、`skills/`、`config/agent.json`、`components/` 的命令与描述改为新路径;README 本地启动步骤里 `.env.example` 位置注明 `deploy/.env.example`。

- [ ] **Step 6: 验收 + 提交**

```bash
pnpm exec tsc --noEmit && echo TSC_PASS
git add -A && git commit -m "chore: deploy目录收敛文档同步并清理cursor规则"
```

---

### Task 8: 终验收与 PR

**Files:** 无代码改动;产出一个验证记录追加到本计划文件末尾。

- [ ] **Step 1: 全量验收**

```bash
pnpm exec tsc --noEmit && echo TSC_PASS
pnpm exec tsx --test --test-concurrency=1 --conditions=react-server $(grep -v '^#' scripts/ci/offline-tests.txt | tr '\n' ' ') 2>&1 | tail -3
PLAYWRIGHT=True pnpm exec playwright test --reporter=line 2>&1 | tail -5   # 与基线对比,不得新增失败
ls -d */ | sort   # 可见一级目录应为: app/ deploy/ docs/ public/ scripts/ server/ tests/ (+node_modules)
```

- [ ] **Step 2: dev 浏览器冒烟**

起 dev(3003),`/ping` pong;`/` 200 且标题 ChatNest;`/api/agent` 返回 JSON(modelConfigured 字段存在即可)。

- [ ] **Step 3: 验证记录与最终提交**

把每批 commit、tsc/单测/e2e 对比结果、一级目录 `ls` 输出追加到本计划文件"Verification"节,提交:

```bash
git add docs/superpowers/plans/2026-10-24-p0-directory-convergence.md
git commit -m "docs: 记录P0目录收敛验收结果"
```

- [ ] **Step 4: push 并开 PR**

```bash
git push -u origin feat/p0-directory-convergence
```
PR 标题:`refactor: P0 一级目录收敛(app/server 双顶层)`;描述链接 spec 与本计划,注明"纯搬运零行为变更 + 验收数据"。等 CI(lint + offline-checks 矩阵)全绿后合并。

---

## Verification(执行时回填)

- 基线:tsc PASS / 离线单测 __ 项 / e2e __
- Task 3-7 各批:tsc PASS / 单测 31 套件
- 终验收:tsc / 单测 / e2e 对比 / ls 一级目录 / dev 冒烟

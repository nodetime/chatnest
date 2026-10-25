#!/usr/bin/env node
// 开发基座自闭环脚本:依赖体检与安装指引 -> .env.local -> 开发库(docker compose) -> 迁移 -> 委托 dev-env.mjs 启动。
// 进程级能力(查网卡/绑定启动/杀死)由同目录 dev-env.mjs 承担;本脚本只做编排闭环。
// 用法:
//   node .claude/skills/dev-env/scripts/dev-env-loop.mjs up            一键拉起(Windows/macOS/Linux 自适配)
//   node .claude/skills/dev-env/scripts/dev-env-loop.mjs down          收尾:杀 dev + 停库(数据保留)
//   node .claude/skills/dev-env/scripts/dev-env-loop.mjs down --purge  彻底清库(删数据卷,不可恢复)
// 仅用 Node 内置模块,不引第三方依赖。

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 本脚本位于 .claude/skills/dev-env/scripts/,仓库根需上跳四级
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const GOVERNANCE = path.join(ROOT, "scripts", "governance");
const COMPOSE_FILE = path.join("deploy", "docker-compose.dev.yml");
const ENV_LOCAL = path.join(ROOT, ".env.local");
const ENV_EXAMPLE = path.join(ROOT, "deploy", ".env.example");
const VOLUME_NAME = "chatnest-postgres-data";
const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 13;

const platform = process.platform; // win32 | darwin | linux
const isWindows = platform === "win32";

function log(tag, message) {
  console.log(`[${tag}] ${message}`);
}

function run(command, args, options = {}) {
  // Windows 下 corepack/pnpm 是 .cmd 垫片,必须经 shell 执行
  const needsShell = isWindows && ["corepack", "pnpm"].includes(command);
  return spawnSync(command, args, { cwd: ROOT, encoding: "utf8", shell: needsShell, ...options });
}

function ok(command, args) {
  return run(command, args).status === 0;
}

function waitSync(ms) {
  // 同步等待:跨平台用 ping 间隔实现(Windows n+1 秒 / Unix -n 间隔近似)
  if (isWindows) {
    spawnSync("ping", ["-n", `${Math.floor(ms / 1000) + 1}`, "127.0.0.1"], { shell: false });
  } else {
    spawnSync("sleep", [`${Math.max(1, Math.floor(ms / 1000))}`], { shell: false });
  }
}

function guide(lines) {
  for (const line of lines) {
    log("指引", line);
  }
}

// ---------- 阶段 0:依赖体检(跨平台) ----------

function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const pass = major > MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR);
  if (pass) {
    log("体检", `Node ${process.versions.node} 达标(要求 >= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR})`);
    return;
  }
  log("体检", `[失败] Node ${process.versions.node} 低于要求 >= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}`);
  guide([
    "Windows: winget install OpenJS.NodeJS.LTS",
    "macOS:   brew install node@22 (或 https://nodejs.org/ 装 pkg)",
    "Linux:   使用 NodeSource 或包管理器安装 Node 22",
    "官网:    https://nodejs.org/",
  ]);
  process.exit(1);
}

function installDocker() {
  log("体检", "[缺失] Docker,尝试自动安装");
  if (isWindows) {
    const result = run("winget", [
      "install",
      "-e",
      "--id",
      "Docker.DockerDesktop",
      "--accept-source-agreements",
      "--accept-package-agreements",
    ], { shell: true });
    if (result.status === 0) {
      log("体检", "Docker Desktop 安装命令已完成,通常需启动一次(部分机器需注销重登)");
      return;
    }
  } else if (platform === "darwin") {
    const result = run("brew", ["install", "--cask", "docker"]);
    if (result.status === 0) {
      log("体检", "Docker Desktop 已装,需手动启动一次完成初始化");
      return;
    }
  } else {
    const result = run("sh", ["-c", "curl -fsSL https://get.docker.com | sh"]);
    if (result.status === 0) {
      log("体检", "Docker 已安装(compose 插件随脚本装入)");
      return;
    }
  }
  guide([
    "自动安装失败,请手工安装后重试:",
    "Windows: https://www.docker.com/products/docker-desktop/ 或 winget install -e --id Docker.DockerDesktop",
    "macOS:   brew install --cask docker(或官网 dmg;服务器可改用 OrbStack/colima)",
    "Linux:   curl -fsSL https://get.docker.com | sh",
  ]);
  process.exit(1);
}

function ensureDockerTooling() {
  if (!ok("docker", ["--version"])) {
    installDocker();
    if (!ok("docker", ["--version"])) {
      log("体检", "[失败] Docker CLI 仍不可用");
      process.exit(1);
    }
  }
  log("体检", `Docker CLI: ${run("docker", ["--version"]).stdout.trim()}`);
  if (!ok("docker", ["compose", "version"])) {
    log("体检", "[缺失] docker compose 子命令");
    guide(["请升级 Docker Desktop 到最新版,或参考 https://docs.docker.com/compose/install/ 安装插件"]);
    process.exit(1);
  }
  log("体检", `Compose: ${run("docker", ["compose", "version"]).stdout.trim()}`);
}

function ensureDockerDaemon() {
  if (ok("docker", ["info"])) {
    return;
  }
  log("体检", "Docker 守护进程未运行,尝试拉起...");
  if (isWindows) {
    const desktop = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
    if (existsSync(desktop)) {
      run("cmd", ["/c", "start", "", desktop]);
    }
  } else if (platform === "darwin") {
    run("open", ["-a", "Docker"]);
  } else {
    run("sh", ["-c", "sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null || true"]);
  }
  process.stdout.write("[体检] 等待守护进程");
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (ok("docker", ["info"])) {
      console.log();
      log("体检", "Docker 守护进程已就绪");
      return;
    }
    process.stdout.write(".");
    waitSync(2000);
  }
  console.log();
  guide(["守护进程 90 秒内未就绪:请手动打开 Docker Desktop / 启动 docker 服务后重试"]);
  process.exit(1);
}

// ---------- 阶段 1:环境文件 ----------

function ensureEnvLocal() {
  if (existsSync(ENV_LOCAL)) {
    const text = readFileSync(ENV_LOCAL, "utf8");
    if (/^POSTGRES_URL=\S+/m.test(text)) {
      log("环境", ".env.local 已存在,沿用当前配置");
      return;
    }
  }
  log("环境", ".env.local 缺失,从 deploy/.env.example 生成并填充本地开发默认值");
  let text = existsSync(ENV_EXAMPLE) ? readFileSync(ENV_EXAMPLE, "utf8") : "";
  const secret = randomBytes(32).toString("base64");
  text = text
    .replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET=${secret}`)
    .replace(/^POSTGRES_URL=.*$/m, "POSTGRES_URL=postgres://chatnest:chatnest@127.0.0.1:55432/chatnest");
  writeFileSync(ENV_LOCAL, text, "utf8");
  log("环境", "已生成 .env.local(AUTH_SECRET 已随机生成,数据库指向本地开发库)");
  log("环境", "[提示] 模型三件套(OPENAI_API_KEY/BASE_URL/MODEL)仍为空,聊天功能需自行填写后重启");
}

// ---------- 阶段 2:开发库 ----------

function adoptLegacyContainer() {
  const existing = run("docker", [
    "inspect",
    "-f",
    '{{index .Config.Labels "com.docker.compose.project"}}',
    "chatnest-postgres",
  ]);
  if (existing.status !== 0 || (existing.stdout || "").trim()) {
    return; // 不存在,或已由 compose 管理
  }
  log("数据库", "发现非 compose 管理的遗留容器 chatnest-postgres,接管为 compose 托管(数据在卷中不受影响)");
  run("docker", ["rm", "-f", "chatnest-postgres"]);
}

function upDatabase() {
  adoptLegacyContainer();
  log("数据库", `docker compose 拉起 PostgreSQL(127.0.0.1:55432,数据卷 ${VOLUME_NAME})`);
  const up = run("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d"]);
  if (up.status !== 0) {
    log("数据库", `[失败] ${up.stderr || up.stdout}`);
    process.exit(1);
  }
  process.stdout.write("[数据库] 等待健康检查");
  const deadline = Date.now() + 60_000;
  let healthy = false;
  while (Date.now() < deadline) {
    const result = run("docker", ["inspect", "-f", "{{.State.Health.Status}}", "chatnest-postgres"]);
    if (result.status === 0 && result.stdout.trim() === "healthy") {
      healthy = true;
      break;
    }
    process.stdout.write(".");
    waitSync(1500);
  }
  console.log();
  if (!healthy) {
    log("数据库", "[失败] 60 秒未就绪,查看日志: docker logs chatnest-postgres");
    process.exit(1);
  }
  log("数据库", "PostgreSQL 已就绪(chatnest/chatnest@127.0.0.1:55432)");
}

// ---------- 阶段 3:迁移 ----------

function migrate() {
  log("迁移", "执行 pnpm db:migrate(幂等)");
  const result = run("corepack", ["pnpm", "db:migrate"], { stdio: "inherit" });
  if (result.status !== 0) {
    log("迁移", "[失败] 请检查 POSTGRES_URL 与 docker logs chatnest-postgres");
    process.exit(1);
  }
}

// ---------- 阶段 4:委托进程工具启动(网卡清单/绑定/优雅停止都在它那里) ----------

function start() {
  const child = spawn(process.execPath, [path.join(GOVERNANCE, "dev-env.mjs"), "start"], {
    cwd: ROOT,
    stdio: "inherit",
  });
  const forward = (signal) => {
    try {
      child.kill(signal);
    } catch {}
  };
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));
  child.on("exit", (code) => {
    log("闭环", `dev 已退出(code ${code});数据库保留运行,需要一并停止执行 pnpm dev:down`);
    process.exit(code ?? 0);
  });
}

// ---------- down ----------

function down(purge) {
  console.log("=== 开发基座收尾 ===");
  run(process.execPath, [path.join(GOVERNANCE, "dev-env.mjs"), "stop"], { stdio: "inherit" });
  if (purge) {
    log("收尾", `--purge:停止容器并删除数据卷 ${VOLUME_NAME}(数据将全部丢失)`);
    run("docker", ["compose", "-f", COMPOSE_FILE, "down", "-v"]);
    run("docker", ["volume", "rm", VOLUME_NAME]);
    log("收尾", "数据卷已删除;下次 up 将初始化全新数据库");
  } else {
    run("docker", ["compose", "-f", COMPOSE_FILE, "stop"]);
    log("收尾", "数据库容器已停止(数据卷保留,重启不丢数据)");
  }
}

const [command, flag] = process.argv.slice(2);
if (command === "up") {
  console.log("=== ChatNest 开发基座一键拉起 ===");
  checkNode();
  ensureDockerTooling();
  ensureDockerDaemon();
  ensureEnvLocal();
  if (!existsSync(path.join(ROOT, "node_modules"))) {
    log("环境", "node_modules 缺失,执行 pnpm install --frozen-lockfile");
    run("corepack", ["pnpm", "install", "--frozen-lockfile"], { stdio: "inherit" });
  }
  upDatabase();
  migrate();
  start();
} else if (command === "down") {
  down(flag === "--purge");
} else {
  console.log("用法: node scripts/governance/dev-env-loop.mjs up | down [--purge]");
  process.exit(1);
}

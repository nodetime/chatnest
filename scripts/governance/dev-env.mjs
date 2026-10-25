#!/usr/bin/env node
// 开发基座一键编排:依赖体检 -> 开发库(docker compose) -> 数据库迁移 -> 绑定全部网卡启动 dev 服务。
// 用法:
//   node scripts/governance/dev-env.mjs up           一键拉起(内部完成体检/NIC 清单/优雅停止挂载)
//   node scripts/governance/dev-env.mjs down         优雅收尾:停 dev 进程 + 停容器,数据保留
//   node scripts/governance/dev-env.mjs down --purge 再额外删除数据卷(彻底清库,不可恢复)
// 仅用 Node 内置模块,不引第三方依赖。

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const COMPOSE_FILE = path.join("deploy", "docker-compose.dev.yml");
const ENV_LOCAL = path.join(ROOT, ".env.local");
const ENV_EXAMPLE = path.join(ROOT, "deploy", ".env.example");
const DEV_PORT = 3003;
const DEV_HOST = "0.0.0.0"; // 绑定全部网卡:本机与局域网均可访问
const VOLUME_NAME = "chatnest-postgres-data";
const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 13;

const isWindows = process.platform === "win32";

function log(tag, message) {
  console.log(`[${tag}] ${message}`);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: isWindows && command === "winget",
    ...options,
  });
}

function ok(command, args) {
  const result = run(command, args);
  return result.status === 0;
}

// ---------- 阶段 0:依赖体检 ----------

function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const pass = major > MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR);
  if (!pass) {
    log("体检", `[失败] Node ${process.versions.node} 低于要求 >= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}`);
    log("指引", "升级 Node 22 LTS: https://nodejs.org/ 或 winget install OpenJS.NodeJS.LTS");
    process.exit(1);
  }
  log("体检", `Node ${process.versions.node} 达标(要求 >= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR})`);
}

function ensureDockerCli() {
  if (ok("docker", ["--version"])) {
    log("体检", `Docker CLI 已安装: ${run("docker", ["--version"]).stdout.trim()}`);
    return;
  }
  log("体检", "[缺失] Docker CLI,尝试自动安装(winget)");
  const installed = run("winget", [
    "install",
    "-e",
    "--id",
    "Docker.DockerDesktop",
    "--accept-source-agreements",
    "--accept-package-agreements",
  ]);
  if (installed.status !== 0) {
    log("指引", "自动安装失败,请手工安装 Docker Desktop:");
    log("指引", "  Windows: https://www.docker.com/products/docker-desktop/ 或 winget install -e --id Docker.DockerDesktop");
    log("指引", "  macOS:   brew install --cask docker");
    log("指引", "  Linux:   curl -fsSL https://get.docker.com | sh");
    log("指引", "安装后启动 Docker Desktop 再重试 pnpm dev:up");
    process.exit(1);
  }
  log("体检", "Docker Desktop 安装命令已完成,通常需要启动一次 Docker Desktop(部分机器需注销重登)");
}

function ensureDockerCompose() {
  if (ok("docker", ["compose", "version"])) {
    log("体检", `Compose 可用: ${run("docker", ["compose", "version"]).stdout.trim()}`);
    return;
  }
  log("体检", "[缺失] docker compose 子命令(Docker Desktop 自带;旧版 Docker 需装独立 compose 插件)");
  log("指引", "请升级 Docker Desktop 到最新版,或参考 https://docs.docker.com/compose/install/ 安装插件");
  process.exit(1);
}

function ensureDockerDaemon() {
  if (ok("docker", ["info"])) {
    return;
  }
  log("体检", "Docker 守护进程未运行,尝试启动 Docker Desktop...");
  const desktop = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
  if (isWindows && existsSync(desktop)) {
    run("cmd", ["/c", "start", "", desktop]);
  }
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (ok("docker", ["info"])) {
      log("体检", "Docker 守护进程已就绪");
      return;
    }
    process.stdout.write(".");
    spawnSync("ping", ["-n", "3", "127.0.0.1"], { shell: false }); // 同步等待约 2 秒再探
  }
  console.log();
  log("指引", "Docker 守护进程 90 秒内未就绪:请手动打开 Docker Desktop 等其变为 Running 后重试");
  process.exit(1);
}

// ---------- 阶段 1:本地环境文件 ----------

function ensureEnvLocal() {
  if (existsSync(ENV_LOCAL)) {
    const text = readFileSync(ENV_LOCAL, "utf8");
    if (/^POSTGRES_URL=\S+/m.test(text)) {
      log("环境", ".env.local 已存在,沿用当前配置");
      return;
    }
  }
  log("环境", ".env.local 缺失,从 deploy/.env.example 生成并填充本地开发默认值");
  let text = existsSync(ENV_EXAMPLE)
    ? readFileSync(ENV_EXAMPLE, "utf8")
    : "";
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
    "{{index .Config.Labels \"com.docker.compose.project\"}}",
    "chatnest-postgres",
  ]);
  if (existing.status !== 0) {
    return; // 容器不存在,无需接管
  }
  if ((existing.stdout || "").trim()) {
    return; // 已由 compose 管理
  }
  log("数据库", "发现非 compose 管理的遗留容器 chatnest-postgres,接管为 compose 托管");
  log("数据库", "仅删除旧容器壳,数据在命名卷 " + VOLUME_NAME + " 中不受影响");
  run("docker", ["rm", "-f", "chatnest-postgres"]);
}

function waitForHealthy(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = run("docker", [
      "inspect",
      "-f",
      "{{.State.Health.Status}}",
      "chatnest-postgres",
    ]);
    if (result.status === 0 && result.stdout.trim() === "healthy") {
      return true;
    }
    process.stdout.write(".");
    spawnSync("ping", ["-n", "2", "127.0.0.1"], { shell: false }); // 同步等待约 1 秒再探
  }
  console.log();
  return false;
}

function upDatabase() {
  adoptLegacyContainer();
  log("数据库", "docker compose 拉起 PostgreSQL(127.0.0.1:55432,数据卷 " + VOLUME_NAME + ")");
  const up = run("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d"]);
  if (up.status !== 0) {
    log("数据库", `[失败] ${up.stderr || up.stdout}`);
    process.exit(1);
  }
  process.stdout.write("[数据库] 等待健康检查");
  if (!waitForHealthy(60_000)) {
    log("数据库", "[失败] 60 秒未就绪,查看日志: docker logs chatnest-postgres");
    process.exit(1);
  }
  console.log();
  log("数据库", "PostgreSQL 已就绪(chatnest/chatnest@127.0.0.1:55432)");
}

// ---------- 阶段 3:迁移 ----------

function migrate() {
  log("迁移", "执行 pnpm db:migrate(幂等)");
  const result = run("corepack", ["pnpm", "db:migrate"], { stdio: "inherit" });
  if (result.status !== 0) {
    log("迁移", "[失败] 数据库迁移出错,请检查 POSTGRES_URL 与数据库日志");
    process.exit(1);
  }
}

// ---------- 阶段 4:网卡清单(启动横幅的组成部分) ----------

function printNetworkBanner() {
  const groups = networkInterfaces();
  const seen = new Set();
  const rows = [];
  for (const [name, addresses = []] of Object.entries(groups)) {
    for (const address of addresses) {
      if (address.family !== "IPv4" || seen.has(address.address)) {
        continue;
      }
      seen.add(address.address);
      rows.push({ name, address: address.address, internal: address.internal });
    }
  }
  log("网卡", "服务绑定 " + DEV_HOST + ",以下地址均可访问(端口 " + DEV_PORT + "):");
  for (const row of rows.sort((a, b) => Number(a.internal) - Number(b.internal))) {
    const scope = row.internal ? "本机回环" : "局域网/本机";
    console.log(`         http://${row.address}:${DEV_PORT}   (${row.name}, ${scope})`);
  }
  if (!rows.some((row) => !row.internal)) {
    console.log("         (未发现局域网 IPv4 网卡,仅本机可访问)");
  }
}

// ---------- 阶段 5:dev 服务与优雅停止 ----------

function probePing(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      fetch(`http://127.0.0.1:${DEV_PORT}/ping`)
        .then((response) => (response.ok ? response.text() : null))
        .then((body) => (body === "pong" ? resolve(true) : retry()))
        .catch(retry);
    };
    const retry = () => {
      if (Date.now() > deadline) {
        resolve(false);
      } else {
        setTimeout(attempt, 1000);
      }
    };
    attempt();
  });
}

function stopDatabase(purge) {
  if (purge) {
    log("收尾", "down --purge:停止容器并删除数据卷 " + VOLUME_NAME + "(数据将全部丢失)");
    run("docker", ["compose", "-f", COMPOSE_FILE, "down", "-v"]);
    run("docker", ["volume", "rm", VOLUME_NAME]);
    log("收尾", "数据卷已删除;下次 up 将初始化全新数据库");
    return;
  }
  run("docker", ["compose", "-f", COMPOSE_FILE, "stop"]);
  log("收尾", "数据库容器已停止(数据卷保留,重启不丢数据)");
}

function killPortListeners() {
  // 兜底:清掉可能残留的 3003 监听进程(down 场景或上次 Ctrl+C 未净)
  const netstat = run("netstat", ["-ano"]).stdout || "";
  const pids = new Set();
  for (const line of netstat.split("\n")) {
    if (line.includes(`:${DEV_PORT}`) && line.trim().startsWith("TCP")) {
      const pid = Number(line.trim().split(/\s+/).pop());
      if (Number.isFinite(pid) && pid > 0) {
        pids.add(pid);
      }
    }
  }
  for (const pid of pids) {
    run("taskkill", ["/PID", String(pid), "/T", "/F"]);
    log("收尾", `已结束占用 ${DEV_PORT} 端口的进程树 (PID ${pid})`);
  }
}

async function up() {
  console.log("=== ChatNest 开发基座一键拉起 ===");
  checkNode();
  ensureDockerCli();
  ensureDockerCompose();
  ensureDockerDaemon();
  ensureEnvLocal();
  upDatabase();
  migrate();
  printNetworkBanner();
  log("服务", `启动 dev(0.0.0.0:${DEV_PORT}),Ctrl+C 优雅停止(库默认保留)`);

  const child = spawn("corepack", ["pnpm", "dev", "--hostname", DEV_HOST, "--port", String(DEV_PORT)], {
    cwd: ROOT,
    stdio: "inherit",
    shell: isWindows,
  });

  const ready = await probePing(120_000);
  if (ready) {
    log("服务", `/ping 探活通过,开发环境就绪: http://127.0.0.1:${DEV_PORT}`);
  } else {
    log("服务", "[警告] 120 秒内 /ping 未就绪,dev 进程仍在运行,请自行查看上方日志");
  }

  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) {
      return;
    }
    stopping = true;
    log("收尾", `收到 ${signal},优雅停止:先停 dev,再停数据库(数据保留)`);
    try {
      child.kill(signal);
    } catch {}
    setTimeout(() => {
      try {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      } catch {}
      stopDatabase(false);
      process.exit(0);
    }, 2500);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  child.on("exit", (code) => {
    if (!stopping) {
      log("服务", `dev 进程已退出(code ${code}),按约定保留数据库运行;需要一并停止请执行 pnpm dev:down`);
      process.exit(code ?? 0);
    }
  });
}

function down(purge) {
  console.log("=== ChatNest 开发基座收尾 ===");
  killPortListeners();
  stopDatabase(purge);
  log("收尾", "完成");
}

const [command, flag] = process.argv.slice(2);
if (command === "up") {
  await up();
} else if (command === "down") {
  down(flag === "--purge");
} else {
  console.log("用法: node scripts/governance/dev-env.mjs up | down [--purge]");
  process.exit(1);
}

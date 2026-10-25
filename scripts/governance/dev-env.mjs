#!/usr/bin/env node
// 开发进程治理工具:只做三件事 —— 检查网络(列网卡)/ 绑定全部网卡启动 dev / 优雅杀死 dev。
// 不负责依赖体检、docker、迁移等编排;那是由 .claude/skills/dev-env 驱动的自闭环流程(见该 SKILL.md)。
// 用法:
//   node scripts/governance/dev-env.mjs nics    列出全部网卡与可访问地址
//   node scripts/governance/dev-env.mjs start   绑定 0.0.0.0:3003 启动 dev(Ctrl+C 优雅停止)
//   node scripts/governance/dev-env.mjs stop    杀死残留的 dev 进程(按 3003 端口定位进程树)
// 仅用 Node 内置模块,不引第三方依赖。

import { spawn, spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEV_PORT = 3003;
const DEV_HOST = "0.0.0.0"; // 绑定全部网卡:本机与局域网均可访问
const isWindows = process.platform === "win32";

function log(tag, message) {
  console.log(`[${tag}] ${message}`);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: ROOT, encoding: "utf8", ...options });
}

// ---------- 能力 1:检查网络 ----------

function nics() {
  const rows = [];
  const seen = new Set();
  for (const [name, addresses = []] of Object.entries(networkInterfaces())) {
    for (const address of addresses) {
      if (address.family !== "IPv4" || seen.has(address.address)) {
        continue;
      }
      seen.add(address.address);
      rows.push({ name, address: address.address, internal: address.internal });
    }
  }
  rows.sort((a, b) => Number(a.internal) - Number(b.internal));
  log("网卡", `共 ${rows.length} 个 IPv4 地址;服务绑定 ${DEV_HOST} 时以下均可访问(端口 ${DEV_PORT}):`);
  for (const row of rows) {
    const scope = row.internal ? "本机回环" : "局域网/本机";
    console.log(`         http://${row.address}:${DEV_PORT}   (${row.name}, ${scope})`);
  }
  if (!rows.some((row) => !row.internal)) {
    console.log("         (未发现局域网 IPv4 网卡,仅本机可访问)");
  }
}

// ---------- 能力 2:绑定全部网卡启动 ----------

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

function start() {
  nics();
  log("启动", `dev 绑定 ${DEV_HOST}:${DEV_PORT}(Ctrl+C 优雅停止本进程)`);
  const child = spawn(
    "corepack",
    ["pnpm", "dev", "--hostname", DEV_HOST, "--port", String(DEV_PORT)],
    { cwd: ROOT, stdio: "inherit", shell: isWindows }
  );

  probePing(120_000).then((ready) => {
    if (ready) {
      log("启动", `/ping 探活通过: http://127.0.0.1:${DEV_PORT}`);
    } else {
      log("启动", "[警告] 120 秒内 /ping 未就绪,dev 进程仍在运行,请查看上方日志");
    }
  });

  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) {
      return;
    }
    stopping = true;
    log("停止", `收到 ${signal},正在优雅停止 dev 进程...`);
    try {
      child.kill(signal);
    } catch {}
    setTimeout(() => {
      try {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      } catch {}
      process.exit(0);
    }, 2000);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  child.on("exit", (code) => {
    if (!stopping) {
      log("停止", `dev 进程已退出(code ${code});残留监听可用 pnpm dev:stop 清理`);
      process.exit(code ?? 0);
    }
  });
}

// ---------- 能力 3:优雅杀死 ----------

function stop() {
  const pids = new Set();
  if (isWindows) {
    const netstat = run("netstat", ["-ano"]).stdout || "";
    for (const line of netstat.split("\n")) {
      if (line.includes(`:${DEV_PORT}`) && line.trim().startsWith("TCP")) {
        const pid = Number(line.trim().split(/\s+/).pop());
        if (Number.isFinite(pid) && pid > 0) {
          pids.add(pid);
        }
      }
    }
  } else {
    // macOS / Linux:lsof 定位监听进程
    const lsof = run("lsof", ["-ti", `tcp:${DEV_PORT}`, "-sTCP:LISTEN"]);
    for (const pid of (lsof.stdout || "").split("\n")) {
      const value = Number(pid);
      if (Number.isFinite(value) && value > 0) {
        pids.add(value);
      }
    }
  }
  if (pids.size === 0) {
    log("停止", `端口 ${DEV_PORT} 无监听进程,无需清理`);
    return;
  }
  for (const pid of pids) {
    if (isWindows) {
      run("taskkill", ["/PID", String(pid), "/T", "/F"]);
    } else {
      run("kill", ["-TERM", String(pid)]); // 先礼后兵;1 秒后仍存活再强杀
      const alive = run("kill", ["-0", String(pid)]);
      if (alive.status === 0) {
        run("pkill", ["-KILL", "-P", String(pid)]);
        run("kill", ["-KILL", String(pid)]);
      }
    }
    log("停止", `已结束占用 ${DEV_PORT} 的进程${isWindows ? "树" : ""} (PID ${pid})`);
  }
}

const command = process.argv[2];
if (command === "nics") {
  nics();
} else if (command === "start") {
  start();
} else if (command === "stop") {
  stop();
} else {
  console.log("用法: node scripts/governance/dev-env.mjs nics | start | stop");
  process.exit(1);
}

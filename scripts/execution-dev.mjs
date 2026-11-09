import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, chmodSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const name = "chatnest-execution-dev";
const image = "chatnest-execution:dev";
function docker(args, options = {}) {
  const result = spawnSync("docker", args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    throw new Error("Execution service command failed.");
  }
  return result;
}
function stop() {
  const existing = spawnSync(
    "docker",
    [
      "inspect",
      "--format",
      '{{index .Config.Labels "chatnest.execution.dev"}}',
      name,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  if (existing.status === 0) {
    if (existing.stdout.trim() !== "true") {
      throw new Error("Container name is already in use by another service.");
    }
    docker(["stop", "--time", "20", name]);
    docker(["rm", name]);
  }
  const runners = docker(
    ["ps", "-aq", "--filter", `label=chatnest.execution.instance=${name}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  )
    .stdout.trim()
    .split(/\s+/)
    .filter(Boolean);
  if (runners.length) {
    docker(["rm", "-f", ...runners]);
  }
}
if (process.argv[2] === "down") {
  stop();
} else if (process.argv[2] === "up") {
  const settings = [];
  if (!process.env.EXECUTION_SERVICE_TOKEN) {
    process.env.EXECUTION_SERVICE_TOKEN = randomBytes(32).toString("hex");
    settings.push(
      `EXECUTION_SERVICE_TOKEN=${process.env.EXECUTION_SERVICE_TOKEN}`
    );
  }
  if (!process.env.EXECUTION_SERVICE_URL) {
    process.env.EXECUTION_SERVICE_URL = "http://127.0.0.1:3345";
    settings.push(`EXECUTION_SERVICE_URL=${process.env.EXECUTION_SERVICE_URL}`);
  }
  if (process.env.EXECUTION_SERVICE_TOKEN.length < 32) {
    throw new Error(
      "Execution service token must contain at least 32 characters."
    );
  }
  if (settings.length) {
    appendFileSync(".env.local", `\n${settings.join("\n")}\n`, { mode: 0o600 });
    chmodSync(".env.local", 0o600);
  }
  const address = new URL(process.env.EXECUTION_SERVICE_URL);
  if (
    address.hostname !== "127.0.0.1" ||
    address.protocol !== "http:" ||
    !address.port
  ) {
    throw new Error(
      "Local execution service requires an explicit loopback HTTP port."
    );
  }
  docker(["build", "--target", "execution", "-t", image, "."]);
  stop();
  docker([
    "run",
    "-d",
    "--name",
    name,
    "--label",
    "chatnest.execution.dev=true",
    "--restart",
    "unless-stopped",
    "--memory",
    "128m",
    "--memory-swap",
    "128m",
    "--cpus",
    "0.25",
    "--pids-limit",
    "64",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=16m",
    "--log-opt",
    "max-size=5m",
    "--log-opt",
    "max-file=2",
    "-p",
    `127.0.0.1:${address.port}:8080`,
    "-v",
    "/var/run/docker.sock:/var/run/docker.sock",
    "-e",
    "EXECUTION_SERVICE_TOKEN",
    "-e",
    `EXECUTION_IMAGE=${image}`,
    "-e",
    "EXECUTION_INSTANCE_ID=chatnest-execution-dev",
    image,
  ]);
  console.log(
    "Execution service started. Use the existing pnpm dev command for ChatNest; restart an already running dev server to load the private configuration."
  );
} else {
  throw new Error("Usage: node scripts/execution-dev.mjs {up|down}");
}

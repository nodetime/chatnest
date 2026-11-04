import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";

const controlToken = "local-alert-control-token";
const deploymentId = "chatnest-alert-acceptance";
const captured = [];
let mode = "attention";

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  if (request.url === "/alert") {
    const body = JSON.parse(await readBody(request));
    captured.push(body);
    response.writeHead(202, { "content-type": "application/json" });
    response.end(JSON.stringify({ accepted: true }));
    return;
  }
  if (request.headers["x-chatnest-control-token"] !== controlToken) {
    response.writeHead(401);
    response.end();
    return;
  }
  if (request.url === "/api/internal/billing/outbox" && mode === "failure") {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ code: "FIXTURE_UPSTREAM_DOWN" }));
    return;
  }
  const body =
    request.url === "/api/internal/billing/outbox"
      ? { deadLettered: 1, failed: 0, processed: 0, succeeded: 0 }
      : {
          completed: 0,
          failed: 0,
          inspected: 0,
          purged: 0,
          sent: 0,
          skipped: 0,
        };
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

async function runWorker() {
  const child = spawn(
    process.execPath,
    ["scripts/platform-settlement-worker.mjs"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        CHATNEST_ALERT_WEBHOOK_URL: `http://127.0.0.1:${port}/alert`,
        CHATNEST_BASE_URL: `http://127.0.0.1:${port}`,
        CHATNEST_CONTROL_TOKEN: controlToken,
        CHATNEST_DEPLOYMENT_ID: deploymentId,
        CHATNEST_WORKER_TIMEOUT_MS: "3000",
        PLATFORM_MODE: "standalone",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const [exit] = await once(child, "exit");
  return exit;
}

const attentionExit = await runWorker();
mode = "failure";
const failureExit = await runWorker();
server.close();

const serialized = JSON.stringify(captured);
const secretLeak =
  serialized.includes(controlToken) || serialized.includes("PAYLOAD");
const kinds = captured
  .map((entry) => entry.kind)
  .sort((a, b) => a.localeCompare(b));
const ok =
  attentionExit === 1 &&
  failureExit === 1 &&
  kinds.includes("billing_attention") &&
  kinds.includes("worker_failed") &&
  !secretLeak;
console.log(
  JSON.stringify({
    attentionExit,
    deliveryCount: captured.length,
    failureExit,
    kinds,
    secretLeak,
  })
);
process.exitCode = ok ? 0 : 1;

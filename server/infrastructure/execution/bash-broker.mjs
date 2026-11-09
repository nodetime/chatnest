import { spawn } from "node:child_process";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const BODY_LIMIT = 16 * 1024 * 1024;
const FILE_LIMIT = 4 * 1024 * 1024;
const FILES_LIMIT = 12 * 1024 * 1024;
const LABEL = "chatnest.execution.instance";
const failure = (error) => ({
  error,
  exitCode: null,
  files: {},
  status: "failed",
  stderr: "",
  stdout: "",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateFiles(files) {
  if (!isRecord(files)) {
    throw new Error("files must be an object.");
  }
  const entries = Object.entries(files);
  if (entries.length > 64) {
    throw new Error("Too many workspace files.");
  }
  let total = 0;
  for (const [name, content] of entries) {
    if (
      !name ||
      name.length > 240 ||
      name.startsWith("/") ||
      name.includes("\\") ||
      [...name].some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      ) ||
      name.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error("Invalid workspace path.");
    }
    if (typeof content !== "string") {
      throw new Error("Workspace files must contain UTF-8 text.");
    }
    const size = Buffer.byteLength(content);
    if (size > FILE_LIMIT) {
      throw new Error("Workspace input exceeds 4 MiB.");
    }
    total += size + Buffer.byteLength(name);
    if (total > FILES_LIMIT) {
      throw new Error("Workspace files exceed 12 MiB.");
    }
  }
}

function validSession(value) {
  return (
    isRecord(value) &&
    typeof value.sessionId === "string" &&
    typeof value.leaseId === "string" &&
    /^[a-f0-9]{64}$/.test(value.sessionId) &&
    /^[a-f0-9-]{36}$/.test(value.leaseId)
  );
}

function validateInput(value) {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !["command", "files", "sessionId", "leaseId"].includes(key)
    ) ||
    !validSession(value) ||
    typeof value.command !== "string" ||
    !value.command.trim() ||
    value.command.length > 32_000 ||
    value.command.includes("\0")
  ) {
    throw new Error("Invalid execution request.");
  }
  validateFiles(value.files);
  return value;
}

function validateResult(value) {
  if (
    !isRecord(value) ||
    !["completed", "failed"].includes(value.status) ||
    !(
      value.exitCode === null ||
      (Number.isInteger(value.exitCode) &&
        value.exitCode >= -255 &&
        value.exitCode <= 255)
    ) ||
    typeof value.stdout !== "string" ||
    typeof value.stderr !== "string" ||
    Buffer.byteLength(value.stdout) > 16_384 ||
    Buffer.byteLength(value.stderr) > 16_384 ||
    (value.error !== undefined &&
      (typeof value.error !== "string" || value.error.length > 1000)) ||
    (value.status === "completed" && value.exitCode !== 0)
  ) {
    throw new Error("Invalid execution response.");
  }
  validateFiles(value.files);
  return {
    exitCode: value.exitCode,
    status: value.status,
    stderr: value.stderr,
    stdout: value.stdout,
    ...(value.error === undefined ? {} : { error: value.error }),
    files: value.files,
    ...Object.fromEntries(
      ["stdout", "stderr"].flatMap((name) => {
        if (value[`${name}File`] === undefined) {
          return [];
        }
        if (
          !/^\.tool-output\/[a-f0-9]{32}\.(stdout|stderr)\.txt$/.test(
            value[`${name}File`]
          ) ||
          !Number.isSafeInteger(value[`${name}Bytes`]) ||
          value[`${name}Bytes`] < 0 ||
          typeof value[`${name}Truncated`] !== "boolean"
        ) {
          throw new Error("Invalid output reference.");
        }
        return ["File", "Bytes", "Truncated"].map((suffix) => [
          name + suffix,
          value[name + suffix],
        ]);
      })
    ),
  };
}

export function createBroker({
  image,
  token,
  instanceId = "chatnest-execution",
  spawnProcess = spawn,
  deadlineMs = 30_000,
  operationTimeoutMs = 5000,
  idleTimeoutMs = 30 * 60_000,
  leaseTimeoutMs = 60_000,
  maxSessions = 4,
} = {}) {
  if (
    typeof image !== "string" ||
    !image ||
    image.startsWith("-") ||
    /\s/.test(image)
  ) {
    throw new Error("EXECUTION_IMAGE is required.");
  }
  if (typeof token !== "string" || Buffer.byteLength(token) < 32) {
    throw new Error("EXECUTION_SERVICE_TOKEN must contain at least 32 bytes.");
  }
  if (!/^chatnest-execution(?:-[a-z0-9][a-z0-9-]{0,47})?$/.test(instanceId)) {
    throw new Error("Invalid execution instance identifier.");
  }
  const expectedToken = Buffer.from(`Bearer ${token}`);
  const active = new Set();
  const sessions = new Map();
  let admission = Promise.resolve();
  let stopping = false;

  function docker(
    args,
    {
      input,
      signal,
      maxOutput = BODY_LIMIT,
      timeoutMs = operationTimeoutMs,
    } = {}
  ) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawnProcess("docker", args, {
          env: { PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin" },
          stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        });
      } catch {
        reject(new Error("Execution container process failed to start."));
        return;
      }
      let finished = false;
      let bytes = 0;
      let stderrBytes = 0;
      const chunks = [];
      const finish = (error, code) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (error) {
          child.kill("SIGKILL");
          reject(error);
        } else {
          resolve({ code, stdout: Buffer.concat(chunks).toString("utf8") });
        }
      };
      const abort = () =>
        finish(new Error("Execution stopped or exceeded its deadline."));
      const timer = setTimeout(
        () => finish(new Error("Execution container operation timed out.")),
        timeoutMs
      );
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxOutput) {
          finish(new Error("Execution response exceeds its limit."));
        } else {
          chunks.push(Buffer.from(chunk));
        }
      });
      child.stderr.on("data", (chunk) => {
        stderrBytes += chunk.length;
        if (stderrBytes > 16_384) {
          finish(
            new Error("Execution container diagnostics exceed their limit.")
          );
        }
      });
      child.once("error", () =>
        finish(new Error("Execution container process failed."))
      );
      child.once("close", (code) => finish(undefined, code));
      child.stdin?.on("error", () =>
        finish(new Error("Execution container input failed."))
      );
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        abort();
      } else if (input !== undefined) {
        child.stdin.end(input);
      }
    });
  }

  async function remove(name) {
    const removed = await docker(["rm", "--force", name], {
      maxOutput: 16_384,
    });
    // --rm may have already removed a completed container. Confirm absence
    // rather than accepting an arbitrary daemon failure as successful cleanup.
    if (removed.code !== 0) {
      const selector = /^[a-f0-9]{12,64}$/.test(name)
        ? `id=${name}`
        : `name=^/${name}$`;
      const listed = await docker(
        ["ps", "--all", "--filter", selector, "--format", "{{.ID}}"],
        { maxOutput: 16_384 }
      );
      if (listed.code !== 0 || listed.stdout.trim()) {
        throw new Error("Execution container cleanup failed.");
      }
    }
  }

  async function discard(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || session.reclaiming) {
      return;
    }
    session.reclaiming = true;
    try {
      await remove(session.name);
      sessions.delete(sessionId);
    } finally {
      session.reclaiming = false;
    }
  }

  async function reapSessions() {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (
        !session.executing &&
        ((session.leaseId && now - session.touched > leaseTimeoutMs) ||
          (!session.leaseId && now - session.touched > idleTimeoutMs))
      ) {
        // biome-ignore lint/performance/noAwaitInLoops: Reclaim one isolated environment at a time.
        await discard(id);
      }
    }
  }

  async function reserveSession(sessionId, leaseId) {
    const previous = admission;
    let unlock;
    admission = new Promise((resolve) => {
      unlock = resolve;
    });
    await previous;
    try {
      let session = sessions.get(sessionId);
      if (session?.leaseId || session?.reclaiming) {
        throw new Error("This conversation workspace is busy.");
      }
      if (!session && sessions.size >= maxSessions) {
        const [oldest] = [...sessions.entries()]
          .filter(
            ([, item]) => !item.leaseId && !item.executing && !item.reclaiming
          )
          .sort(([, a], [, b]) => a.touched - b.touched);
        if (!oldest) {
          throw new Error(
            "Execution workspace capacity reached; all workspaces are busy."
          );
        }
        await discard(oldest[0]);
      }
      if (!session) {
        session = {
          name: `${instanceId}-${randomUUID()}`,
          touched: Date.now(),
        };
        sessions.set(sessionId, session);
      }
      session.leaseId = leaseId;
      session.executing = true;
      return session;
    } finally {
      unlock();
    }
  }

  async function execute(payload, signal) {
    const { sessionId, leaseId, command, files } = payload;
    let session;
    try {
      session = await reserveSession(sessionId, leaseId);
    } catch (error) {
      return failure(error.message);
    }
    const { name } = session;
    try {
      if (!session.started) {
        const created = await docker(
          [
            "create",
            "--name",
            name,
            "--label",
            `${LABEL}=${instanceId}`,
            "--network",
            "none",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--user",
            "65532:65532",
            "--memory",
            "256m",
            "--memory-swap",
            "256m",
            "--cpus",
            "0.5",
            "--pids-limit",
            "64",
            "--log-opt",
            "max-size=5m",
            "--log-opt",
            "max-file=2",
            "--tmpfs",
            "/workspace:rw,noexec,nosuid,nodev,size=32m,mode=1777",
            "--tmpfs",
            "/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777",
            "--workdir",
            "/workspace",
            "--env",
            "PATH=/usr/local/bin:/usr/bin:/bin",
            "--env",
            "HOME=/workspace",
            "--env",
            "TMPDIR=/tmp",
            "--env",
            "OPENBLAS_NUM_THREADS=1",
            "--env",
            "PYTHONDONTWRITEBYTECODE=1",
            "--entrypoint",
            "python3",
            image,
            "-I",
            "-c",
            "import signal,time; signal.signal(signal.SIGCHLD, signal.SIG_IGN); time.sleep(2147483647)",
          ],
          { maxOutput: 16_384 }
        );
        if (created.code !== 0) {
          throw new Error("Execution container could not be created.");
        }
        const started = await docker(["start", name], { maxOutput: 16_384 });
        if (started.code !== 0) {
          throw new Error("Execution workspace could not start.");
        }
        session.started = true;
      }
      signal.throwIfAborted();
      const output = await docker(
        [
          "exec",
          "--interactive",
          name,
          "python3",
          "-I",
          "/opt/chatnest/bash-runner.py",
        ],
        {
          input: JSON.stringify({ command, files }),
          signal,
          timeoutMs: deadlineMs,
        }
      );
      if (output.code !== 0) {
        throw new Error("Execution runner exited unexpectedly.");
      }
      return validateResult(JSON.parse(output.stdout));
    } catch (error) {
      try {
        await discard(sessionId);
      } catch {
        stopping = true;
      }
      return failure(
        error instanceof SyntaxError
          ? "Execution returned invalid JSON; workspace reset."
          : `${error?.message || "Execution failed."} Workspace reset.`
      );
    } finally {
      session.executing = false;
      session.touched = Date.now();
    }
  }

  function send(response, status, value) {
    if (response.destroyed || response.writableEnded) {
      return;
    }
    const body = JSON.stringify(value);
    response.writeHead(status, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    });
    response.end(
      Buffer.byteLength(body) > BODY_LIMIT
        ? JSON.stringify(failure("Execution response exceeds its limit."))
        : body
    );
  }

  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      send(response, stopping ? 503 : 200, {
        status: stopping ? "stopping" : "ok",
      });
      return;
    }
    if (
      request.method !== "POST" ||
      !["/execute", "/release"].includes(request.url)
    ) {
      send(response, 404, { error: "Not found." });
      return;
    }
    const actualToken = Buffer.from(request.headers.authorization || "");
    if (
      actualToken.length !== expectedToken.length ||
      !timingSafeEqual(actualToken, expectedToken)
    ) {
      send(response, 401, { error: "Authentication required." });
      request.resume();
      return;
    }
    if (stopping || (request.url === "/execute" && active.size >= 2)) {
      send(response, stopping ? 503 : 429, {
        error: "Execution service is busy.",
      });
      request.resume();
      return;
    }
    const controller = new AbortController();
    let done;
    const completed = new Promise((resolve) => {
      done = resolve;
    });
    const task = { completed, controller };
    active.add(task);
    const cancelReading = () => {
      if (!request.complete) {
        request.destroy();
      }
    };
    controller.signal.addEventListener("abort", cancelReading, { once: true });
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    const disconnected = () => {
      if (!response.writableEnded) {
        controller.abort();
      }
    };
    response.once("close", disconnected);
    request.once("aborted", disconnected);
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > BODY_LIMIT) {
          send(response, 413, {
            error: "Execution request exceeds its limit.",
          });
          request.resume();
          return;
        }
        controller.signal.throwIfAborted();
        chunks.push(chunk);
      }
      let payload;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (request.url === "/release") {
          if (!validSession(payload) || Object.keys(payload).length !== 2) {
            throw new Error("Invalid lease.");
          }
        } else {
          payload = validateInput(payload);
        }
      } catch {
        send(response, 400, {
          error: "Invalid execution request or workspace files.",
        });
        return;
      }
      controller.signal.throwIfAborted();
      if (request.url === "/release") {
        const session = sessions.get(payload.sessionId);
        if (session?.leaseId === payload.leaseId && !session.executing) {
          session.leaseId = undefined;
          session.touched = Date.now();
        }
        send(response, 200, { status: "released" });
      } else {
        await reapSessions();
        send(response, 200, await execute(payload, controller.signal));
      }
    } catch {
      send(
        response,
        200,
        failure("Execution stopped or could not be cleaned up.")
      );
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", cancelReading);
      request.off("aborted", disconnected);
      response.off("close", disconnected);
      active.delete(task);
      done();
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;

  async function cleanupOrphans() {
    const listed = await docker(
      [
        "ps",
        "--all",
        "--filter",
        `label=${LABEL}=${instanceId}`,
        "--format",
        "{{.ID}}",
      ],
      { maxOutput: 16_384 }
    );
    if (listed.code !== 0) {
      throw new Error("Execution container discovery failed.");
    }
    for (const id of listed.stdout.trim().split(/\s+/).filter(Boolean)) {
      if (!/^[a-f0-9]{12,64}$/.test(id)) {
        throw new Error("Invalid container identifier.");
      }
      // biome-ignore lint/performance/noAwaitInLoops: Bound Docker cleanup load and fail startup on the first unreclaimed container.
      await remove(id);
    }
  }

  const reaper = setInterval(
    () => {
      reapSessions().catch(() => {
        stopping = true;
      });
    },
    Math.min(idleTimeoutMs, leaseTimeoutMs, 30_000)
  );
  reaper.unref();

  async function shutdown() {
    clearInterval(reaper);
    stopping = true;
    const closed = new Promise((resolve) => server.close(resolve));
    for (const task of active) {
      task.controller.abort();
    }
    await Promise.allSettled([...active].map((task) => task.completed));
    try {
      for (const id of [...sessions.keys()]) {
        // biome-ignore lint/performance/noAwaitInLoops: Stop each environment before releasing the service.
        await discard(id);
      }
    } finally {
      server.closeAllConnections();
      await closed;
    }
  }
  return { cleanupOrphans, server, shutdown };
}

export async function startBroker({ env = process.env, ...options } = {}) {
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Invalid PORT.");
  }
  const broker = createBroker({
    image: env.EXECUTION_IMAGE,
    instanceId: env.EXECUTION_INSTANCE_ID || "chatnest-execution",
    token: env.EXECUTION_SERVICE_TOKEN,
    ...options,
  });
  await broker.cleanupOrphans();
  await new Promise((resolve, reject) => {
    broker.server.once("error", reject);
    broker.server.listen(port, "0.0.0.0", resolve);
  });
  return broker;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const broker = await startBroker();
  for (const event of ["SIGTERM", "SIGINT"]) {
    process.once(event, () => {
      broker.shutdown().then(
        () => {
          process.exitCode = 0;
        },
        () => {
          process.exitCode = 1;
        }
      );
    });
  }
}

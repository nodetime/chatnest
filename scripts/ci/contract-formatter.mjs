import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

/** Single formatter boundary; preserve official launchers, without retry/fallback. */
export async function formatContract(
  content,
  root,
  relative,
  payload = false,
  { timeoutMs = 15_000, maxBuffer = 16 * 1024 * 1024 } = {}
) {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isSafeInteger(maxBuffer) ||
    maxBuffer < 1
  ) {
    throw new Error(`GENERATED_FORMAT_LIMITS_INVALID:${relative}`);
  }
  const binary = payload
    ? resolve(root, "apps/server/node_modules/prettier/bin/prettier.cjs")
    : createRequire(resolve(root, "package.json")).resolve(
        "@biomejs/biome/bin/biome"
      );
  const args = payload
    ? [binary, "--stdin-filepath", relative]
    : [binary, "check", "--write", `--stdin-file-path=${relative}`];
  return await new Promise((accept, reject) => {
    const grouped = process.platform !== "win32";
    const child = spawn(process.execPath, args, {
      cwd: payload ? resolve(root, "apps/server") : root,
      detached: grouped,
      stdio: "pipe",
    });
    let failure;
    let inputFailed = false;
    let bytes = 0;
    const stdout = [],
      stderr = [];
    const stop = (code) => {
      if (failure) {
        return;
      }
      failure = new Error(`${code}:${relative}`);
      if (!child.pid) {
        return;
      }
      try {
        // Biome's official JS launcher owns a native descendant with inherited pipes.
        // On the supported Mac/Linux generator hosts, terminate that whole owned group.
        if (grouped) {
          process.kill(-child.pid, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
      } catch (error) {
        if (error.code !== "ESRCH") {
          failure = new Error(`GENERATED_FORMAT_CLEANUP_FAILED:${relative}`);
        }
      }
    };
    const interrupt = () => stop("GENERATED_FORMAT_CANCELED");
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    const timer = setTimeout(() => stop("GENERATED_FORMAT_TIMEOUT"), timeoutMs);
    const collect = (chunks) => (chunk) => {
      if (failure) {
        return;
      }
      bytes += chunk.byteLength;
      if (bytes > maxBuffer) {
        stop("GENERATED_FORMAT_OUTPUT_LIMIT");
      } else {
        chunks.push(chunk);
      }
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    // An early formatter exit can close stdin before all generated input is written.
    child.stdin.on("error", () => {
      inputFailed = true;
    });
    child.once("error", () => {
      failure ??= new Error(`GENERATED_FORMAT_FAILED:${relative}`);
    });
    child.once("close", (status) => {
      clearTimeout(timer);
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
      if (failure) {
        reject(failure);
      } else if (status === 0 && inputFailed) {
        reject(new Error(`GENERATED_FORMAT_INPUT_FAILED:${relative}`));
      } else if (status === 0) {
        accept(Buffer.concat(stdout).toString("utf8"));
      } else {
        reject(
          new Error(
            `GENERATED_FORMAT_FAILED:${relative}:${Buffer.concat(stderr).toString("utf8")}`
          )
        );
      }
    });
    child.stdin.end(content);
  });
}

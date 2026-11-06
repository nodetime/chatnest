import { type ChildProcess, fork } from "node:child_process";
import { join } from "node:path";
import {
  type ExecuteCodeOutput,
  executeCodeInputSchema,
  executeCodeOutputSchema,
} from "@/server/domain/message/code-execution";

let activeExecutions = 0;

export function executeJavascript(
  code: string,
  signal?: AbortSignal
): Promise<ExecuteCodeOutput> {
  executeCodeInputSchema.parse({ code });
  signal?.throwIfAborted();
  if (activeExecutions >= 2) {
    return Promise.resolve({
      error: "计算服务正忙，请稍后再试。",
      logs: [],
      status: "failed",
    });
  }
  activeExecutions += 1;
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = fork(
        join(
          process.cwd(),
          "server/infrastructure/execution/javascript-worker.cjs"
        ),
        [],
        {
          env: { NODE_ENV: "production" },
          execArgv: ["--max-old-space-size=96"],
          stdio: ["ignore", "ignore", "ignore", "ipc"],
        }
      );
    } catch {
      activeExecutions -= 1;
      resolve({
        error: "Execution process failed to start.",
        logs: [],
        status: "failed",
      });
      return;
    }
    child.once("close", () => {
      activeExecutions -= 1;
    });
    let settled = false;
    const finish = (output?: ExecuteCodeOutput, error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      child.once("close", () => {
        if (error) {
          reject(error);
        } else {
          resolve(output as ExecuteCodeOutput);
        }
      });
      child.kill("SIGKILL");
    };
    const fail = (error: string) =>
      finish({ error, logs: [], status: "failed" });
    const abort = () =>
      finish(undefined, signal?.reason || new Error("Execution stopped."));
    const timer = setTimeout(() => fail("Execution deadline exceeded."), 5000);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    child.once("message", (value) => {
      if (JSON.stringify(value).length > 32_000) {
        fail("Execution result exceeds output limit.");
        return;
      }
      const parsed = executeCodeOutputSchema.safeParse(value);
      if (parsed.success) {
        finish(parsed.data);
      } else {
        fail("Execution returned an invalid result.");
      }
    });
    child.once("error", () => fail("Execution process failed."));
    child.once("exit", () => fail("Execution process ended without a result."));
    child.send({ code }, (error) => {
      if (error) {
        fail("Execution process communication failed.");
      }
    });
  });
}

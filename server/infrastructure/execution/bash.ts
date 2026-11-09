import {
  type BashResult,
  bashResultSchema,
  workspaceFilesSchema,
} from "@/server/domain/message/bash";

/** Only the trusted broker receives this credential; commands run in separate containers. */
export async function executeBash(
  input: {
    command: string;
    files: Record<string, string>;
    sessionId: string;
    leaseId: string;
  },
  signal?: AbortSignal
): Promise<BashResult> {
  return bashResultSchema.parse(
    await requestExecution("/execute", input, signal)
  );
}

/** A lease spans execution and artifact CAS writes, so another turn cannot run midway. */
export async function releaseBash(input: {
  sessionId: string;
  leaseId: string;
}) {
  await requestExecution("/release", input);
}

async function requestExecution(
  path: string,
  input: object,
  signal?: AbortSignal
): Promise<unknown> {
  const endpoint = process.env.EXECUTION_SERVICE_URL;
  const token = process.env.EXECUTION_SERVICE_TOKEN;
  if (!endpoint || !token || token.length < 32) {
    throw new Error(
      "Bash execution is not configured. Start the execution service and set EXECUTION_SERVICE_URL and EXECUTION_SERVICE_TOKEN."
    );
  }
  const url = new URL(endpoint);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("Invalid execution service origin.");
  }
  if ("files" in input) {
    workspaceFilesSchema.parse(input.files);
  }
  const timeout = AbortSignal.timeout(40_000);
  const response = await fetch(new URL(path, url), {
    body: JSON.stringify(input),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    redirect: "error",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Execution service returned HTTP ${response.status}.`);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Execution service returned no result.");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      // biome-ignore lint/performance/noAwaitInLoops: Sequential stream reads enforce the response byte limit.
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > 16 * 1024 * 1024) {
        throw new Error("Execution service result exceeds size limit.");
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

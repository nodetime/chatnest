import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { UploadCapacity, UploadCapacityError } from "@/lib/uploads/capacity";
import {
  type DocumentExtraction,
  MAX_DOCUMENT_BYTES,
} from "@/lib/uploads/document-types";
import { UploadError } from "@/lib/uploads/validation";

const capacity = new UploadCapacity(1);
// Standalone JS is deliberately traced by Next, not a TS path presumed runnable in production.
export async function parseDocument(
  bytes: Buffer,
  mime: string
): Promise<DocumentExtraction> {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) {
    throw new UploadError(400, "文档必须非空，且不超过 64 MiB。");
  }
  try {
    return await capacity.run(async () => runParserWorker(bytes, mime));
  } catch (error) {
    if (error instanceof UploadCapacityError) {
      // biome-ignore lint/style/useErrorCause: Expose only the bounded public busy status.
      throw new UploadError(429, "文档读取繁忙，请稍后重试。");
    }
    throw error;
  }
}

// Trusted internal dependency seam for offline deadline/cleanup verification, never request-controlled.
export async function runParserWorker(
  bytes: Buffer,
  mime: string,
  options: { workerFile?: string; deadlineMs?: number } = {}
): Promise<DocumentExtraction> {
  const dir = await mkdtemp(join(tmpdir(), "chatnest-document-"));
  let worker: Worker | undefined;
  try {
    await chmod(dir, 0o700);
    return await new Promise<DocumentExtraction>((resolve, reject) => {
      // Native Node constructor: avoid Turbopack treating this as a browser worker entry.
      worker = Reflect.construct(Worker, [
        options.workerFile ??
          join(process.cwd(), "lib/uploads/document-worker.cjs"),
        {
          env: { NODE_ENV: "production", TEMP: dir, TMP: dir, TMPDIR: dir },
          execArgv: [],
          resourceLimits: {
            maxOldGenerationSizeMb: 256,
            maxYoungGenerationSizeMb: 32,
            stackSizeMb: 4,
          },
          stderr: true,
          stdout: true,
          workerData: {
            bytes,
            mime,
            // Literal native dependency seeds let Next's route tracer retain pnpm's
            // directory resolution links; include-globs alone drop directory symlinks.
            // Resolution does not initialize these heavy parsers in the host process.
            runtimeFiles: [
              require.resolve("mammoth"),
              require.resolve("exceljs"),
              require.resolve("yauzl"),
              require.resolve("saxes"),
              require.resolve("papaparse"),
            ],
          },
        },
      ]);
      // Drain diagnostic output without persisting parser text, names or private paths.
      worker.stdout?.resume();
      worker.stderr?.resume();
      const timer = setTimeout(
        () =>
          reject(new UploadError(422, "文档读取超时（20 秒），请拆分后重试。")),
        Math.min(20_000, Math.max(1, options.deadlineMs ?? 20_000))
      );
      worker.once(
        "message",
        (result: {
          ok: boolean;
          extraction: DocumentExtraction;
          error: string;
        }) => {
          clearTimeout(timer);
          if (result.ok) {
            resolve(result.extraction);
          } else {
            reject(new UploadError(422, result.error));
          }
        }
      );
      worker.once("error", () => {
        clearTimeout(timer);
        reject(
          new UploadError(422, "文档读取失败或超过解析内存预算，请拆分后重试。")
        );
      });
      worker.once("exit", () => {
        clearTimeout(timer);
        reject(new UploadError(422, "文档读取进程已终止，请拆分后重试。"));
      });
    });
  } finally {
    try {
      await worker?.terminate();
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  }
}

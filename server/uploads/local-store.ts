import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, parse, resolve } from "node:path";
import { MAX_DOCUMENT_BYTES } from "./document-types";
import { UUID_PATTERN } from "./refs";
import { MAX_FILE_BYTES, UploadError } from "./validation";

type Env = Record<string, string | undefined>;
export function storageDirectory(env: Env = process.env) {
  if (env.VERCEL === "1") {
    throw new UploadError(
      503,
      "Vercel Functions 不支持本地持久化附件，请使用自托管持久卷；私有对象存储适配尚未实现。"
    );
  }
  const value = env.UPLOAD_STORAGE_DIR?.trim();
  if (value && !isAbsolute(value)) {
    throw new UploadError(503, "UPLOAD_STORAGE_DIR 必须是绝对路径。");
  }
  if (!value && env.NODE_ENV === "production") {
    throw new UploadError(503, "生产环境需配置持久化 UPLOAD_STORAGE_DIR。");
  }
  return value || resolve(".data/private-uploads");
}
export function quotaLimits(env: Env = process.env) {
  const quota = (key: string, fallback: number) => {
    const n = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(n) || n < MAX_FILE_BYTES || n > 1024 ** 4) {
      throw new UploadError(503, `${key} 配置无效。`);
    }
    return n;
  };
  return {
    deployment: quota("UPLOAD_TOTAL_QUOTA_BYTES", 1024 ** 3),
    user: quota("UPLOAD_USER_QUOTA_BYTES", 100 * 1024 ** 2),
  };
}
export class LocalUploadStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = root;
  }
  private async path(id: string) {
    if (!UUID_PATTERN.test(id)) {
      throw new UploadError(400, "文件标识无效。");
    }
    // Reject symlinks in every existing parent, including the storage root.
    const absolute = resolve(this.root);
    let cursor = parse(absolute).root;
    for (const segment of absolute
      .slice(cursor.length)
      .split("/")
      .filter(Boolean)) {
      cursor = join(cursor, segment);
      try {
        // biome-ignore lint/performance/noAwaitInLoops: Bounded sequential I/O prevents concurrent memory and transaction pressure.
        if ((await lstat(cursor)).isSymbolicLink()) {
          throw new Error("symlink");
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
    await mkdir(absolute, { mode: 0o700, recursive: true });
    if ((await realpath(absolute)) !== absolute) {
      throw new Error("noncanonical storage directory");
    }
    return join(absolute, id);
  }
  async write(id: string, bytes: Buffer) {
    const file = await open(
      await this.path(id),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    );
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
  }
  async read(id: string, expected: number) {
    if (
      !Number.isSafeInteger(expected) ||
      expected < 1 ||
      expected > MAX_DOCUMENT_BYTES
    ) {
      throw new Error("invalid size");
    }
    const file = await open(
      await this.path(id),
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size !== expected) {
        throw new Error("size mismatch");
      }
      const bytes = Buffer.alloc(expected);
      const { bytesRead } = await file.read(bytes, 0, expected, 0);
      if (bytesRead !== expected) {
        throw new Error("short read");
      }
      return bytes;
    } finally {
      await file.close();
    }
  }
  async verify(id: string, expected: number, sha256: string) {
    if (
      !Number.isSafeInteger(expected) ||
      expected < 1 ||
      expected > MAX_DOCUMENT_BYTES
    ) {
      throw new Error("invalid size");
    }
    const file = await open(
      await this.path(id),
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size !== expected) {
        throw new Error("size mismatch");
      }
      const hash = createHash("sha256");
      for await (const chunk of file.createReadStream({
        autoClose: false,
        highWaterMark: 64 * 1024,
      })) {
        hash.update(chunk);
      }
      if (hash.digest("hex") !== sha256) {
        throw new Error("hash mismatch");
      }
    } finally {
      await file.close();
    }
  }
  async delete(id: string) {
    try {
      await unlink(await this.path(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
}

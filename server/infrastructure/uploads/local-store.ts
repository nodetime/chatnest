import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, parse, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { MAX_DOCUMENT_BYTES } from "@/server/domain/attachment/document-types";
import { UUID_PATTERN } from "@/server/domain/attachment/refs";
import {
  MAX_FILE_BYTES,
  UploadError,
} from "@/server/shared/uploads/validation";

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
const runFile = promisify(execFile);
const ACL_CHECK_TIMEOUT_MS = 10_000;
// NTFS 权限不能通过 stat.mode 判断；仅信任运行用户和系统服务 SID，读取失败直接拒绝。
const WINDOWS_PRIVATE_ACL_SCRIPT = `
$ErrorActionPreference = 'Stop'
$acl = Get-Acl -LiteralPath $env:CHATNEST_UPLOAD_ACL_PATH
$current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$private = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -eq $current
$ownerAllowed = $false
foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { continue }
  $sid = $rule.IdentityReference.Value
  if ($sid -eq $current) { $ownerAllowed = $true }
  if ($sid -ne $current -and $sid -ne 'S-1-5-18') { $private = $false }
}
if ($private -and $ownerAllowed) { 'private' } else { 'public' }
`;

async function hasPrivateOwner(info: Stats, filename: string) {
  if (process.platform !== "win32") {
    const uid = process.getuid?.();
    return (info.mode & 0o077) === 0 && (uid === undefined || uid === info.uid);
  }
  const powershell = join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );
  const { stdout } = await runFile(
    powershell,
    ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_PRIVATE_ACL_SCRIPT],
    {
      env: { ...process.env, CHATNEST_UPLOAD_ACL_PATH: filename },
      maxBuffer: 4096,
      timeout: ACL_CHECK_TIMEOUT_MS,
      windowsHide: true,
    }
  );
  return stdout.trim() === "private";
}

export class LocalUploadStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = root;
  }
  async checkDirectory() {
    // Reject symlinks in every existing parent, including the storage root.
    const absolute = resolve(this.root);
    let cursor = parse(absolute).root;
    for (const segment of absolute
      .slice(cursor.length)
      .split(sep)
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
    const info = await lstat(absolute);
    if (!info.isDirectory() || !(await hasPrivateOwner(info, absolute))) {
      throw new Error("storage directory is not private");
    }
    return absolute;
  }
  private async path(id: string) {
    if (!UUID_PATTERN.test(id)) {
      throw new UploadError(400, "文件标识无效。");
    }
    return join(await this.checkDirectory(), id);
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
    const filename = await this.path(id);
    const file = await open(
      filename,
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    try {
      const info = await file.stat();
      if (
        !info.isFile() ||
        info.size !== expected ||
        !(await hasPrivateOwner(info, filename))
      ) {
        throw new Error("file metadata mismatch");
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
    const filename = await this.path(id);
    const file = await open(
      filename,
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    try {
      const info = await file.stat();
      if (
        !info.isFile() ||
        info.size !== expected ||
        !(await hasPrivateOwner(info, filename))
      ) {
        throw new Error("file metadata mismatch");
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

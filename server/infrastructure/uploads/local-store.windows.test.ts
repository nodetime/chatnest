import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { LocalUploadStore } from "./local-store";

const run = promisify(execFile);
const windowsOnly = { skip: process.platform !== "win32" };
const fileId = "11111111-1111-4111-8111-111111111111";
const bytes = Buffer.from("private Windows attachment");
const powershell = join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe"
);

async function configureFixturePermissions(target: string, publicRead = false) {
  await run(
    powershell,
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `
$ErrorActionPreference = 'Stop'
$target = $env:CHATNEST_TEST_ACL_TARGET
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$inheritance = 'None'
if ((Get-Item -LiteralPath $target).PSIsContainer) {
  $acl = [System.Security.AccessControl.DirectorySecurity]::new()
  $inheritance = 'ContainerInherit,ObjectInherit'
} else {
  $acl = [System.Security.AccessControl.FileSecurity]::new()
}
$acl.SetOwner($identity)
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($identity, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', $inheritance, 'None', 'Allow')
  $acl.AddAccessRule($rule)
}
if ($env:CHATNEST_TEST_PUBLIC_READ -eq '1') {
  $everyone = [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0')
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($everyone, 'ReadAndExecute', 'Allow')
  $acl.AddAccessRule($rule)
}
if ((Get-Item -LiteralPath $target).PSIsContainer) {
  [System.IO.Directory]::SetAccessControl($target, $acl)
} else {
  [System.IO.File]::SetAccessControl($target, $acl)
}
`,
    ],
    {
      env: {
        ...process.env,
        CHATNEST_TEST_ACL_TARGET: target,
        CHATNEST_TEST_PUBLIC_READ: publicRead ? "1" : "0",
      },
      timeout: 10_000,
    }
  );
}

async function privateFixture() {
  const root = await mkdtemp(join(tmpdir(), "chatnest-private-windows-"));
  await configureFixturePermissions(root);
  return root;
}

test(
  "should_preserve_private_attachment_bytes_when_windows_acl_is_restricted",
  windowsOnly,
  async () => {
    const root = await privateFixture();
    try {
      const store = new LocalUploadStore(root);
      await store.write(fileId, bytes);
      assert.deepEqual(await store.read(fileId, bytes.length), bytes);
      await store.verify(
        fileId,
        bytes.length,
        createHash("sha256").update(bytes).digest("hex")
      );
      await store.delete(fileId);
      await assert.rejects(readFile(join(root, fileId)), { code: "ENOENT" });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
);

test(
  "should_reject_upload_when_windows_directory_grants_other_users_access",
  windowsOnly,
  async () => {
    const root = await privateFixture();
    try {
      await configureFixturePermissions(root, true);
      await assert.rejects(
        new LocalUploadStore(root).write(fileId, bytes),
        /storage directory is not private/
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
);

test(
  "should_reject_read_and_verification_when_windows_file_acl_is_public",
  windowsOnly,
  async () => {
    const root = await privateFixture();
    try {
      await writeFile(join(root, fileId), bytes);
      await configureFixturePermissions(join(root, fileId), true);
      const store = new LocalUploadStore(root);
      await assert.rejects(store.read(fileId, bytes.length));
      await assert.rejects(
        store.verify(
          fileId,
          bytes.length,
          createHash("sha256").update(bytes).digest("hex")
        )
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
);

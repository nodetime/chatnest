"""Persistent conversation workspace runner; Docker is the security boundary."""

import json
import os
import signal
import shutil
import uuid
import stat
import subprocess
import sys
import time
from pathlib import Path

BODY_LIMIT = 16 * 1024 * 1024
FILE_LIMIT = 4 * 1024 * 1024
FILES_LIMIT = 12 * 1024 * 1024
STREAM_LIMIT = 16 * 1024


def valid_path(name):
    return (
        isinstance(name, str) and bool(name) and not name.startswith("/")
        and len(name.encode("utf-16-le")) <= 480
        and "\\" not in name
        and all(ord(character) >= 32 and ord(character) != 127 for character in name)
        and all(part and part not in (".", "..") for part in name.split("/"))
    )


def validate_files(files):
    if not isinstance(files, dict) or len(files) > 64:
        raise ValueError("Invalid workspace file collection.")
    total = 0
    for name, content in files.items():
        if not valid_path(name) or not isinstance(content, str):
            raise ValueError("Invalid workspace path or UTF-8 text.")
        size = len(content.encode("utf-8"))
        if size > FILE_LIMIT:
            raise ValueError("Workspace input exceeds 4 MiB.")
        total += size + len(name.encode("utf-8"))
        if total > FILES_LIMIT:
            raise ValueError("Workspace files exceed 12 MiB.")


def collect_files(workspace):
    files = {}
    total = 0
    if not (workspace / "outputs").exists():
        return files
    if (workspace / "outputs").is_symlink():
        raise ValueError("Output directory must not be a link.")
    def traversal_error(error):
        raise error
    for parent, directories, names, parent_fd in os.fwalk(workspace / "outputs", follow_symlinks=False, onerror=traversal_error):
        for name in directories:
            if not stat.S_ISDIR(os.stat(name, dir_fd=parent_fd, follow_symlinks=False).st_mode):
                raise ValueError("Workspace contains a linked or special directory.")
        for name in names:
            item = Path(parent) / name
            relative = item.relative_to(workspace).as_posix()
            if not valid_path(relative):
                raise ValueError("Invalid workspace output path.")
            metadata = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
                raise ValueError("Workspace contains a linked or special file.")
            if metadata.st_size > FILE_LIMIT:
                raise ValueError(f"Workspace file {relative} is {metadata.st_size} bytes; limit is {FILE_LIMIT} bytes. Extract only required fields or split temporary data across files.")
            if len(files) >= 64:
                raise ValueError("Workspace output exceeds 64 files. Remove unnecessary temporary files.")
            # O_NOFOLLOW closes a symlink replacement between lstat and open.
            descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent_fd)
            with os.fdopen(descriptor, "rb") as stream:
                current = os.fstat(stream.fileno())
                if not stat.S_ISREG(current.st_mode) or current.st_nlink != 1:
                    raise ValueError("Workspace output changed to a linked or special file.")
                content = stream.read(FILE_LIMIT + 1)
            if len(content) > FILE_LIMIT:
                raise ValueError(f"Workspace file {relative} exceeds {FILE_LIMIT} bytes. Extract only required fields or split temporary data across files.")
            total += len(content) + len(relative.encode("utf-8"))
            if total > FILES_LIMIT:
                raise ValueError("Workspace files exceed 12 MiB.")
            try:
                files[relative] = content.decode("utf-8", errors="strict")
            except UnicodeError as error:
                raise ValueError("Workspace output contains a binary or invalid UTF-8 file.") from error
    return files


def reset_directory(path):
    if path.is_symlink() or (path.exists() and not path.is_dir()):
        path.unlink()
    elif path.exists():
        shutil.rmtree(path)
    path.mkdir()


def stop_process(process, isolated=False):
    if process is None:
        return
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait()
    # A command can detach with setsid. In the dedicated container, retain only
    # the runner and its ancestors; never apply this sweep on a host test run.
    if isolated and Path("/.dockerenv").exists() and Path("/proc").exists():
        ancestors = {os.getpid(), 1}
        parent = os.getppid()
        while parent > 1 and parent not in ancestors:
            ancestors.add(parent)
            try:
                parent = int(Path(f"/proc/{parent}/stat").read_text().rsplit(")", 1)[1].split()[1])
            except (OSError, ValueError, IndexError):
                break
        for _attempt in range(50):
            remaining = []
            for item in Path("/proc").iterdir():
                if item.name.isdigit() and int(item.name) not in ancestors:
                    try:
                        state = (item / "stat").read_text().rsplit(")", 1)[1].split()[0]
                        if item.stat().st_uid == os.getuid() and state != "Z":
                            remaining.append(int(item.name))
                    except (FileNotFoundError, ProcessLookupError):
                        pass
            if not remaining:
                return
            for pid in remaining:
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            time.sleep(0.01)
        # An uncertain cleanup must make docker exec fail so the broker resets
        # the environment; publishing while a detached process lives is unsafe.
        raise RuntimeError("Execution background processes could not be stopped.")



def execute(payload, workspace="/workspace", timeout_seconds=30):
    output = {"status": "failed", "exitCode": None, "stdout": "", "stderr": "", "files": {}}
    process = None
    def deadline(_number, _frame):
        raise TimeoutError("Command exceeded its execution deadline.")
    previous_handler = signal.signal(signal.SIGALRM, deadline)
    signal.setitimer(signal.ITIMER_REAL, timeout_seconds)
    try:
        if not isinstance(payload, dict) or set(payload) != {"command", "files"}:
            raise ValueError("Invalid execution request.")
        command = payload["command"]
        if not isinstance(command, str) or not command.strip() or len(command) > 32000 or "\0" in command:
            raise ValueError("Invalid execution command.")
        validate_files(payload["files"])
        workspace = Path(workspace).resolve(strict=True)
        # Only confirmed database artifacts may seed outputs. Discard failed,
        # rejected or unconfirmed drafts before another command can publish them.
        reset_directory(workspace / "outputs")
        for name, content in payload["files"].items():
            item = workspace / name
            item.parent.mkdir(parents=True, exist_ok=True)
            if not item.parent.resolve().is_relative_to(workspace) or item.is_symlink():
                raise ValueError("Workspace input must not traverse links.")
            parent = item.parent
            while parent != workspace:
                if parent.is_symlink():
                    raise ValueError("Workspace input must not traverse links.")
                parent = parent.parent
            if item.exists() and (not item.is_file() or item.stat().st_nlink != 1):
                raise ValueError("Workspace input must not overwrite linked or special files.")
            descriptor = os.open(item, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as stream:
                stream.write(content)
        logs = workspace / ".tool-output"
        logs.mkdir(exist_ok=True)
        if logs.is_symlink():
            raise ValueError("Tool output directory must not be a link.")
        command_id = uuid.uuid4().hex
        paths = {name: logs / f"{command_id}.{name}.txt" for name in ("stdout", "stderr")}
        with paths["stdout"].open("xb") as stdout, paths["stderr"].open("xb") as stderr:
            process = subprocess.Popen(
                ["/bin/bash", "--noprofile", "--norc", "-c", command],
                cwd=workspace, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                start_new_session=True,
                env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": str(workspace),
                     "TMPDIR": "/tmp", "OPENBLAS_NUM_THREADS": "1",
                     "PYTHONDONTWRITEBYTECODE": "1"},
            )
            output["exitCode"] = process.wait()
            stop_process(process, workspace == Path("/workspace"))
            process = None
        for name, path in paths.items():
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(descriptor, "rb") as stream:
                metadata = os.fstat(stream.fileno())
                if not stat.S_ISREG(metadata.st_mode):
                    raise ValueError("Invalid tool output file.")
                preview = stream.read(STREAM_LIMIT)
            output[name] = preview.decode("utf-8", errors="replace").encode("utf-8")[:STREAM_LIMIT].decode("utf-8", errors="ignore")
            output[name + "File"] = path.relative_to(workspace).as_posix()
            output[name + "Bytes"] = metadata.st_size
            output[name + "Truncated"] = metadata.st_size > len(output[name].encode("utf-8"))
            if output[name + "Truncated"]:
                notice = f"\n[Preview truncated; full output: {output[name + 'File']} ({metadata.st_size} bytes). Use bash to read selected ranges.]"
                output[name] = output[name].encode("utf-8")[:STREAM_LIMIT - len(notice.encode("utf-8"))].decode("utf-8", errors="ignore") + notice
        if output["exitCode"] == 0:
            output["files"] = collect_files(workspace)
            output["status"] = "completed"
        else:
            output["error"] = "Command exited unsuccessfully."
    except (ValueError, OSError, UnicodeError) as error:
        output["error"] = str(error)[:1000]
        output["files"] = {}
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous_handler)
        stop_process(process, workspace == Path("/workspace"))
    return output


def main():
    try:
        body = sys.stdin.buffer.read(BODY_LIMIT + 1)
        if len(body) > BODY_LIMIT:
            raise ValueError("Execution request exceeds 16 MiB.")
        output = execute(json.loads(body))
    except (ValueError, UnicodeError) as error:
        output = {"status": "failed", "exitCode": None, "stdout": "", "stderr": "", "error": str(error)[:1000], "files": {}}
    encoded = json.dumps(output, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > BODY_LIMIT:
        encoded = json.dumps({"status": "failed", "exitCode": None, "stdout": "", "stderr": "", "error": "Execution response exceeds 16 MiB.", "files": {}}).encode("utf-8")
    sys.stdout.buffer.write(encoded)


if __name__ == "__main__":
    main()

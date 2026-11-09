import { randomUUID } from "node:crypto";
import type { DocumentRepository } from "@/server/domain/document/repository";
import { isProtectedResultTable } from "@/server/domain/document/result-table";
import { isValidSheetCsv } from "@/server/domain/document/sheet-csv";
import type { Document } from "@/server/domain/document/types";
import {
  type BashOutput,
  type BashResult,
  bashResultSchema,
  type WorkspaceArtifact,
  workspaceArtifactSchema,
  workspaceFilesSchema,
} from "@/server/domain/message/bash";

type Options = {
  execute: (
    input: { command: string; files: Record<string, string>; leaseId: string },
    signal?: AbortSignal
  ) => Promise<BashResult>;
  release: (leaseId: string) => Promise<void>;
  messages: readonly { role: string; parts?: readonly unknown[] }[];
  publish: (document: Document) => void;
  repository: Pick<DocumentRepository, "findLatestById" | "save">;
  sources: () => Record<string, string>;
  userId: string;
};
function artifactKind(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (extension === "csv") {
    return "sheet" as const;
  }
  if (["md", "txt"].includes(extension ?? "")) {
    return "text" as const;
  }
  if (
    [
      "py",
      "js",
      "ts",
      "json",
      "html",
      "css",
      "sh",
      "sql",
      "svg",
      "yaml",
      "yml",
    ].includes(extension ?? "")
  ) {
    return "code" as const;
  }
  throw new Error(
    `Unsupported output format: ${path}. Save tables as CSV, prose as Markdown/text, or source code.`
  );
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Owns artifact synchronization; the broker owns the conversation execution environment. */
export class BashWorkspace {
  private files: Record<string, string> = {};
  private readonly artifacts = new Map<string, WorkspaceArtifact>();
  private restored = false;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly options: Options;
  constructor(options: Options) {
    this.options = options;
  }

  private restore() {
    if (this.restored) {
      return;
    }
    this.restored = true;
    for (const message of this.options.messages) {
      if (message.role !== "assistant") {
        continue;
      }
      for (const part of message.parts ?? []) {
        if (
          !record(part) ||
          part.state !== "output-available" ||
          !record(part.output)
        ) {
          continue;
        }
        let entries: unknown[] = [];
        if (
          (part.type === "tool-bash" || part.type === "tool-writeFile") &&
          Array.isArray(part.output.artifacts)
        ) {
          entries = part.output.artifacts;
        }
        // Existing saved user documents are files too; this does not expose their former execution tools.
        if (
          [
            "tool-createDocument",
            "tool-editDocument",
            "tool-updateDocument",
          ].includes(String(part.type)) &&
          !("error" in part.output)
        ) {
          const { output } = part;
          entries = [
            {
              ...output,
              path: `outputs/${output.id}.${output.kind === "sheet" ? "csv" : output.kind === "code" ? "py" : "md"}`,
            },
          ];
        }
        for (const entry of entries) {
          const parsed = workspaceArtifactSchema.safeParse(entry);
          if (parsed.success) {
            this.artifacts.set(parsed.data.path, parsed.data);
          }
        }
      }
    }
    if (this.artifacts.size > 20) {
      throw new Error(
        "Too many saved files in this conversation; use a new conversation."
      );
    }
  }

  run(
    command: string,
    signal?: AbortSignal,
    updates: Record<string, string> = {},
    persist = true,
    sourceSnapshot?: Record<string, string>
  ): Promise<BashOutput> {
    const pending = this.tail.then(() =>
      this.runExclusive(command, signal, updates, persist, sourceSnapshot)
    );
    this.tail = pending.catch(() => undefined);
    return pending;
  }

  async syncSources(
    files: Record<string, string>,
    signal?: AbortSignal
  ): Promise<void> {
    if (Object.keys(files).length === 0) {
      return;
    }
    const result = await this.run("true", signal, {}, false, files);
    if (result.status !== "completed") {
      throw new Error(result.error ?? "Source file save failed.");
    }
  }

  private async runExclusive(
    command: string,
    signal: AbortSignal | undefined,
    updates: Record<string, string>,
    persist: boolean,
    sourceSnapshot?: Record<string, string>
  ): Promise<BashOutput> {
    const failure = (
      error: string,
      outcome?: BashResult,
      artifacts: WorkspaceArtifact[] = []
    ): BashOutput => ({
      ...outcome,
      artifacts,
      error,
      exitCode: outcome?.exitCode ?? null,
      files: Object.keys(this.files),
      status: "failed",
      stderr: outcome?.stderr ?? "",
      stdout: outcome?.stdout ?? "",
    });
    const leaseId = randomUUID();
    let attempted = false;
    const savedArtifacts: WorkspaceArtifact[] = [];
    let result: BashResult | undefined;
    try {
      signal?.throwIfAborted();
      this.restore();
      const baselines = new Map<string, Document>();
      this.files = {};
      for (const [path, artifact] of this.artifacts) {
        // biome-ignore lint/performance/noAwaitInLoops: Bounded owned documents are refreshed sequentially before execution.
        const document = await this.options.repository.findLatestById(
          artifact.id
        );
        if (
          !document ||
          document.userId !== this.options.userId ||
          isProtectedResultTable(document.content) ||
          document.kind !== artifact.kind
        ) {
          throw new Error(
            "A workspace file is missing or no longer accessible."
          );
        }
        this.files[path] = document.content ?? "";
        baselines.set(path, document);
      }
      // Raw source files always come from the authorized ledger, never from a previous command's edited copy.
      workspaceFilesSchema.parse(updates);
      if (Object.keys(updates).some((path) => path.startsWith("sources/"))) {
        throw new Error("Source files are read-only inputs.");
      }
      const inputs = workspaceFilesSchema.parse({
        ...this.files,
        ...updates,
        ...(sourceSnapshot ?? this.options.sources()),
      });
      attempted = true;
      result = bashResultSchema.parse(
        await this.options.execute({ command, files: inputs, leaseId }, signal)
      );
      signal?.throwIfAborted();
      if (result.status !== "completed" || result.exitCode !== 0) {
        return failure(
          result.error ?? "Command failed; generated changes were not saved.",
          result
        );
      }
      if (!persist) {
        return {
          ...result,
          artifacts: [],
          exitCode: result.exitCode,
          files: Object.keys(result.files),
          status: "completed",
          stderr: result.stderr,
          stdout: result.stdout,
        };
      }
      const nextFiles = Object.fromEntries(
        Object.entries(result.files).filter(
          ([path]) => !path.startsWith("sources/")
        )
      );
      const outputs = Object.entries(nextFiles).filter(
        ([path]) =>
          path.startsWith("outputs/") &&
          baselines.get(path)?.content !== nextFiles[path]
      );
      if (outputs.length > 10) {
        throw new Error(
          "At most 10 changed output files can be saved per command."
        );
      }
      // Validate every output before the first database write.
      const drafts = outputs.map(([path, content]) => {
        const kind = artifactKind(path);
        if (
          !content.trim() ||
          Buffer.byteLength(content) > 100_000 ||
          isProtectedResultTable(content) ||
          (kind === "sheet" && !isValidSheetCsv(content))
        ) {
          throw new Error(
            `Output file is empty, too large or invalid: ${path}. No output files were saved.`
          );
        }
        return {
          content,
          kind,
          path,
          title: (path.split("/").at(-1) ?? path).slice(0, 200),
        };
      });
      for (const draft of drafts) {
        const baseline = baselines.get(draft.path);
        signal?.throwIfAborted();
        // biome-ignore lint/performance/noAwaitInLoops: Publish each actual saved result; never claim a later failed write succeeded.
        const [saved] = await this.options.repository.save({
          content: draft.content,
          expectedContent: baseline?.content ?? null,
          expectedVersion: baseline?.createdAt.toISOString() ?? null,
          id: baseline?.id ?? randomUUID(),
          kind: draft.kind,
          title: draft.title,
          userId: this.options.userId,
        });
        if (!saved) {
          throw new Error(`File save was not confirmed: ${draft.path}`);
        }
        const artifact = {
          id: saved.id,
          kind: draft.kind,
          path: draft.path,
          title: saved.title,
          version: saved.createdAt.toISOString(),
        };
        this.artifacts.set(draft.path, artifact);
        savedArtifacts.push(artifact);
        this.options.publish(saved);
      }
      // Intermediate files remain in the broker; only outputs cross this boundary.
      return {
        ...result,
        artifacts: savedArtifacts,
        exitCode: result.exitCode,
        files: Object.keys(result.files),
        status: "completed",
        stderr: result.stderr,
        stdout: result.stdout,
      };
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      return failure(
        error instanceof Error ? error.message : "Execution failed.",
        result,
        savedArtifacts
      );
    } finally {
      if (attempted) {
        try {
          await this.options.release(leaseId);
        } catch {
          console.warn(
            "Execution lease release failed; broker expiry will reclaim it."
          );
        }
      }
    }
  }
}

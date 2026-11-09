import { z } from "zod";

export const WORKSPACE_FILE_BYTES = 4 * 1024 * 1024;

export const workspacePathSchema = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (path) =>
      ![...path].some(
        (char) =>
          char === "\\" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
      ) &&
      path
        .split("/")
        .every((part) => part !== "" && part !== "." && part !== ".."),
    "Use a relative workspace path without traversal."
  );
export const workspaceFilesSchema = z
  .record(
    workspacePathSchema,
    z
      .string()
      .refine((value) => Buffer.byteLength(value) <= WORKSPACE_FILE_BYTES)
  )
  .refine(
    (files) =>
      Object.keys(files).length <= 64 &&
      Object.entries(files).reduce(
        (size, [path, value]) =>
          size + Buffer.byteLength(path) + Buffer.byteLength(value),
        0
      ) <=
        12 * 1024 * 1024,
    "Workspace exceeds file budget."
  );
export const bashResultSchema = z.object({
  error: z.string().max(2000).optional(),
  exitCode: z.number().int().nullable(),
  files: workspaceFilesSchema,
  status: z.enum(["completed", "failed"]),
  stderr: z.string().max(32_000),
  stderrBytes: z.number().int().nonnegative().optional(),
  stderrFile: workspacePathSchema.optional(),
  stderrTruncated: z.boolean().optional(),
  stdout: z.string().max(32_000),
  stdoutBytes: z.number().int().nonnegative().optional(),
  stdoutFile: workspacePathSchema.optional(),
  stdoutTruncated: z.boolean().optional(),
});
export const workspaceArtifactSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["text", "code", "sheet"]),
  path: workspacePathSchema.refine((value) => value.startsWith("outputs/")),
  title: z.string().min(1).max(200),
  version: z.string().optional(),
});
export type WorkspaceArtifact = z.infer<typeof workspaceArtifactSchema>;
export type BashResult = z.infer<typeof bashResultSchema>;
export type BashOutput = Omit<BashResult, "files"> & {
  artifacts: WorkspaceArtifact[];
  files: string[];
};
export function sourceFilePath(id: string) {
  return `sources/${encodeURIComponent(id)}.json`;
}

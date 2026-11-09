import { AsyncLocalStorage } from "node:async_hooks";
import { posix } from "node:path";
import { type ToolExecutionOptions, tool } from "ai";
import type { BashWorkspace } from "@/server/application/chat/workspace";
import { workspacePathSchema } from "@/server/domain/message/bash";

const instructions =
  "Use Bash or Python for calculations, data processing and file editing. No network, host files or application credentials; use MCP for retrieval and viewImage for images. MCP sourceFile contains original JSON, not previewOutput. The conversation reuses one execution environment: /workspace and /tmp survive successive commands and turns until idle expiry, capacity recycling or a service restart. Shell variables and cwd reset each command. Saved outputs are restored from the database if the environment expires. stdout/stderr return short previews with full output file paths and byte counts; use Bash to inspect selected ranges of large files. Temporary data and binary files may stay outside outputs/. Only confirmed database artifacts seed outputs/ before each command; failed or unsaved output drafts are discarded. Changed UTF-8 CSV, Markdown, text and source files under outputs/ are validated and saved as editable artifacts after successful execution. Reuse a path to update it. Limits: 30s per command, 32MiB workspace and 16MiB /tmp; up to 10 changed artifacts per command, each nonempty and at most 100,000 bytes. Inspect status, exitCode, errors and artifacts to confirm the result.";
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
function relativePath(path: string) {
  return workspacePathSchema.parse(
    posix.relative("/workspace", posix.resolve("/workspace", path))
  );
}

export async function createWorkspaceTools(
  workspace: BashWorkspace,
  signal: AbortSignal
) {
  const callSignals = new AsyncLocalStorage<AbortSignal>();
  const currentSignal = () => callSignals.getStore() ?? signal;
  function withCallSignal<Input, Output>(
    execute: (input: Input, options: ToolExecutionOptions<unknown>) => Output
  ) {
    return (input: Input, options: ToolExecutionOptions<unknown>) => {
      const callSignal = options.abortSignal
        ? AbortSignal.any([signal, options.abortSignal])
        : signal;
      callSignal.throwIfAborted();
      return callSignals.run(callSignal, () => execute(input, options));
    };
  }
  const write = (
    files: Array<{ path: string; content: string | Buffer }>,
    callSignal = signal
  ) =>
    workspace.run(
      "true",
      callSignal,
      Object.fromEntries(
        files.map(({ path, content }) => [
          relativePath(path),
          content.toString(),
        ])
      )
    );
  const { createBashTool } = await import("bash-tool");
  const { tools } = await createBashTool({
    destination: "/workspace",
    extraInstructions: instructions,
    maxOutputLength: 32_000,
    promptOptions: {
      toolPrompt:
        "Available runtime: native Bash, Python 3, pandas, openpyxl and standard Linux file commands. The working directory is /workspace.",
    },
    sandbox: {
      executeCommand: async (command) => {
        const result = await workspace.run(command, currentSignal());
        return {
          ...result,
          exitCode: result.status === "failed" ? result.exitCode || 1 : 0,
        };
      },
      readFile: async (path: string) => {
        const result = await workspace.run(
          `cat -- ${quote(relativePath(path))}`,
          currentSignal(),
          {},
          false
        );
        if (result.status === "failed") {
          throw new Error(result.error ?? result.stderr);
        }
        return result.stdout;
      },
      writeFiles: async (
        files: Array<{ path: string; content: string | Buffer }>
      ) => {
        const result = await write(files);
        if (result.status === "failed") {
          throw new Error(result.error ?? result.stderr);
        }
      },
    },
  });
  const executeBash = tools.bash.execute;
  const readFile = tools.readFile.execute;
  if (!executeBash || !readFile) {
    throw new Error("The native workspace toolkit has no executor.");
  }
  return {
    ...tools,
    bash: { ...tools.bash, execute: withCallSignal(executeBash) },
    readFile: { ...tools.readFile, execute: withCallSignal(readFile) },
    // Keep the upstream schema; include the actual saved artifact handoff in its result.
    writeFile: tool({
      description: `${tools.writeFile.description} Writes UTF-8 text. Supported files under outputs/ are validated and saved as editable artifacts; reuse the same path to update an existing file. Other paths hold temporary files for this conversation environment. Input transfer limits: 4MiB per file, 64 files and 12MiB total; saved artifacts must be nonempty and at most 100,000 bytes, in CSV, Markdown, text or supported source-code formats. Check status, errors and artifacts to confirm the save.`,
      execute: (
        { path, content }: { path: string; content: string },
        options: { abortSignal?: AbortSignal }
      ) =>
        write(
          [{ content, path }],
          options.abortSignal
            ? AbortSignal.any([signal, options.abortSignal])
            : signal
        ),
      inputSchema: tools.writeFile.inputSchema,
    }),
  };
}

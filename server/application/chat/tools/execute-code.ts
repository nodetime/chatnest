import { tool } from "ai";
import {
  executeCodeInputSchema,
  executeCodeOutputSchema,
} from "@/server/domain/message/code-execution";
import { executeJavascript } from "@/server/infrastructure/execution/javascript";

export function executeCodeTool(signal: AbortSignal) {
  return tool({
    description:
      "Automatically execute synchronous JavaScript for calculations or data processing. Supply a function body and return a JSON-compatible result; console.log is supported. Fresh isolated QuickJS/WASM environment, no files, network, process, require, imports, Python or shell. Small bounded input/output and execution time; return a useful summary rather than bulk data. This executes immediately without a user Run button.",
    execute: ({ code }, options) =>
      executeJavascript(
        code,
        options.abortSignal
          ? AbortSignal.any([signal, options.abortSignal])
          : signal
      ),
    inputSchema: executeCodeInputSchema,
    outputSchema: executeCodeOutputSchema,
  });
}

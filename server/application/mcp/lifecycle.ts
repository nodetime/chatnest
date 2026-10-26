import "server-only";
import type { MCPClient } from "@ai-sdk/mcp";
// Some MCP HTTP responses (202 with no response stream) leave SDK RPC promises pending.
// Race the complete operation, not only fetch; always remove our listener on settlement.
export function abortable<T>(
  operation: () => PromiseLike<T> | T,
  signal: AbortSignal,
  onLateValue?: (value: T) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error("MCP operation cancelled or timed out"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return operation();
      })
      .then(
        (value) => {
          if (settled) {
            onLateValue?.(value);
            return;
          }
          settled = true;
          cleanup();
          resolve(value);
        },
        () => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          reject(new Error("MCP operation failed"));
        }
      );
  });
}
export async function closeManagedClient(
  client: Pick<MCPClient, "close">,
  timeoutMs = 1000
) {
  await abortable(() => client.close(), AbortSignal.timeout(timeoutMs)).catch(
    () => undefined
  );
}

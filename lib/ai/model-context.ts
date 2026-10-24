import { AsyncLocalStorage } from "node:async_hooks";

type Environment = Record<string, string | undefined>;
const context = new AsyncLocalStorage<Readonly<Environment>>();
export function getModelEnvironment(): Readonly<Environment> {
  return context.getStore() ?? process.env;
}
export function runWithModelEnvironment<T>(
  env: Environment,
  action: () => T
): T {
  return context.run(Object.freeze({ ...env }), action);
}
export function hasModelEnvironment() {
  return !!context.getStore();
}

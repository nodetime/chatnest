import { AsyncLocalStorage } from "node:async_hooks";

// 每请求链路的 traceId 上下文:proxy.ts 注入请求头,route handler 读出后经 runWithTraceId
// 建立 AsyncLocalStorage 作用域;logger 的 mixin 在每条日志写出时读取,自动携带。
type RequestContext = { traceId: string };

const requestStorage = new AsyncLocalStorage<RequestContext>();

export function runWithTraceId<T>(traceId: string, fn: () => T): T {
  return requestStorage.run({ traceId }, fn);
}

export function getTraceId(): string | undefined {
  return requestStorage.getStore()?.traceId;
}

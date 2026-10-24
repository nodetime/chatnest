import "server-only";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";
import type { Environment } from "../../agent/mcp-settings/security";

export class ModelNetworkError extends Error {
  readonly code: "destination" | "redirect" | "size" | "timeout" | "network";
  constructor(
    code: "destination" | "redirect" | "size" | "timeout" | "network",
    message: string
  ) {
    super(message);
    this.code = code;
  }
}
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(address, prefix, "ipv4");
}
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const specialV6 = new BlockList();
specialV6.addSubnet("2001::", 23, "ipv6");
specialV6.addSubnet("2001:db8::", 32, "ipv6");
specialV6.addSubnet("2002::", 16, "ipv6");
specialV6.addSubnet("3fff::", 20, "ipv6");
export function isPublicAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !specialV6.check(address, "ipv6");
}
function localAllowed(url: URL, env: Environment) {
  return (
    ["development", "test"].includes(env.NODE_ENV ?? "") &&
    env.MODEL_ALLOW_LOOPBACK_HTTP === "1" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  );
}
export function validateModelURL(
  value: string,
  env: Environment = process.env
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // biome-ignore lint/style/useErrorCause: URL causes may contain credentials.
    throw new Error("模型地址格式错误。");
  }
  if (
    /[\s\\]/.test(value) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /\/(chat\/completions|responses|models)\/?$/.test(url.pathname) ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && localAllowed(url, env)))
  ) {
    throw new Error(
      "模型地址应为 HTTPS API 基础地址，不含凭据、查询参数或接口后缀。"
    );
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    ((isIP(host) && !isPublicAddress(host)) ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local")) &&
    !localAllowed(url, env)
  ) {
    throw new Error("模型地址须指向公网服务。");
  }
  return url;
}
// Pin DNS to a validated IP for the actual TLS socket; never follow redirects.
export function modelFetch(
  baseURL: string,
  env: Environment = process.env
): typeof fetch {
  const base = validateModelURL(baseURL, env);
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (
      url.origin !== base.origin ||
      !["/models", "/chat/completions", "/responses"].some(
        (suffix) => url.pathname === base.pathname.replace(/\/$/, "") + suffix
      ) ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      throw new Error("模型请求目标不匹配。");
    }
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(120_000),
    ]);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new Error("模型连接超时。")),
          { once: true }
        );
        if (signal.aborted) {
          reject(new Error("模型连接超时。"));
        }
      }),
    ]);
    if (
      !addresses.length ||
      (!localAllowed(base, env) &&
        addresses.some((a) => !isPublicAddress(a.address)))
    ) {
      throw new ModelNetworkError(
        "destination",
        "模型域名解析到了内网或代理地址，公网连接校验未通过；请检查服务器 DNS / 代理配置。"
      );
    }
    const body = request.body
      ? Buffer.from(await request.arrayBuffer())
      : undefined;
    if ((body?.length ?? 0) > 32 * 1024 * 1024) {
      throw new Error("模型请求体过大。");
    }
    const [selected] = addresses;
    return new Promise<Response>((resolve, reject) => {
      const outgoing = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          family: selected.family,
          headers: Object.fromEntries(request.headers),
          lookup: (_hostname, _options, callback) =>
            callback(null, selected.address, selected.family),
          method: request.method,
          signal,
        },
        (incoming) => {
          try {
            const status = incoming.statusCode ?? 502;
            if (status >= 300 && status < 400) {
              incoming.destroy();
              reject(
                new ModelNetworkError(
                  "redirect",
                  "模型服务返回了重定向，请填写最终 API 基础地址。"
                )
              );
              return;
            }
            const headers = new Headers();
            for (const [key, value] of Object.entries(incoming.headers)) {
              if (value !== undefined) {
                headers.set(
                  key,
                  Array.isArray(value) ? value.join(",") : value
                );
              }
            }
            const limit = url.pathname.endsWith("/models")
              ? 1_048_576
              : 16_777_216;
            if (Number(headers.get("content-length")) > limit) {
              incoming.destroy();
              reject(new Error("模型响应过大。"));
              return;
            }
            let bytes = 0;
            if (status === 204 || status === 205) {
              incoming.resume();
              resolve(new Response(null, { headers, status }));
              return;
            }
            const source = Readable.toWeb(
              incoming
            ) as ReadableStream<Uint8Array>;
            const bounded = source.pipeThrough(
              new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, controller) {
                  bytes += chunk.byteLength;
                  if (bytes > limit) {
                    throw new Error("模型响应过大。");
                  }
                  controller.enqueue(chunk);
                },
              })
            );
            resolve(new Response(bounded, { headers, status }));
          } catch {
            incoming.destroy();
            reject(new ModelNetworkError("network", "模型响应格式错误。"));
          }
        }
      );
      outgoing.on("error", () =>
        reject(
          new Error(
            signal.aborted ? "模型连接超时或已取消。" : "模型网络连接失败。"
          )
        )
      );
      outgoing.end(body);
    });
  };
}

import { mkdirSync } from "node:fs";
import path from "node:path";
import pino from "pino";
import { build as prettyBuild } from "pino-pretty";
import { createStream as createRotateStream } from "rotating-file-stream";
import { getEnv } from "./env";
import { getTraceId } from "./request-context";

// 统一日志基座(方案:docs/02_FEAT特性/20261025101026_可观测性基座_UUID7_traceId_JSONL日志.md)
// - 生产控制台:原生 JSONL 直吐 stdout(容器收集友好)
// - 开发控制台:pino-pretty 彩色单行(人类阅读)
// - 文件双写:设 LOG_FILE_DIR 才开启,rfs 按 10M/每日轮转,保留 14 份
// - 每条日志经 mixin 自动携带 traceId(AsyncLocalStorage);敏感字段 redact 即抹

const REDACT_PATHS = [
  "authorization",
  "cookie",
  "headers.authorization",
  "headers.cookie",
  "password",
  "secret",
  "apiKey",
  "token",
  "*.password",
  "*.secret",
  "*.apiKey",
  "*.token",
];

export type LogSink = { write: (chunk: string) => void };

type CreateLoggerOptions = {
  // 测试注入内存流;缺省按环境组装 console(+文件)双写
  stream?: LogSink;
  level?: string;
};

function buildStreams(level: string, injected?: LogSink) {
  if (injected) {
    return [{ level, stream: injected }];
  }
  const streams: { level: string; stream: NodeJS.WriteStream | LogSink }[] = [];
  if (getEnv().NODE_ENV === "development") {
    streams.push({
      level,
      stream: prettyBuild({
        colorize: true,
        ignore: "pid,hostname,service",
        translateTime: "SYS:HH:MM:ss.l",
      }),
    });
  } else {
    streams.push({ level, stream: process.stdout });
  }
  const { LOG_FILE_DIR: dir } = getEnv();
  if (dir) {
    mkdirSync(path.resolve(dir), { recursive: true });
    streams.push({
      level,
      stream: createRotateStream("chatnest.log", {
        interval: "1d",
        maxFiles: 14,
        path: path.resolve(dir),
        size: "10M",
      }),
    });
  }
  return streams;
}

export function createLogger(options: CreateLoggerOptions = {}) {
  const level = options.level ?? getEnv().LOG_LEVEL ?? "info";
  return pino(
    {
      base: { service: "chatnest" },
      level,
      // mixin 在每条日志写出时求值,拿到的是当次异步上下文里的 traceId
      mixin: () => {
        const traceId = getTraceId();
        return traceId ? { traceId } : {};
      },
      redact: { censor: "[Redacted]", paths: REDACT_PATHS },
    },
    pino.multistream(buildStreams(level, options.stream))
  );
}

export const logger = createLogger();

export function getLogger(mod: string) {
  return logger.child({ mod });
}

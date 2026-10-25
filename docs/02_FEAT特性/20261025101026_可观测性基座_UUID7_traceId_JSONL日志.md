# 可观测性基座:UUID7 + 每请求 traceId + JSONL 双写日志

> 日期:2026-10-25
> 状态:方案已获用户批准,随文实施
> 关联:[01_架构决策/20261025101500_DDD分层待办P1-P4.md](../01_架构决策/20261025101500_DDD分层待办P1-P4.md)(logger/request-context 落在 server/shared,即 P1 的 shared 地基)

## 一、选型依据(对标高星实践)

| 决策 | 选型 | 依据 |
| --- | --- | --- |
| UUID7 | `uuid@^11` 官方包 | 2 万+ 星,v10.0 起原生 `v7()`(RFC 9562);毫秒时间戳前缀、按时间可排序,配 PG 主键与日志检索;不引入独立 `uuidv7` 小包(长期未发版) |
| 日志器 | `pino@^10` | 15k+ 星,Fastify/Hono 默认;原生 JSONL 输出,容器收集友好;child logger + mixin 机制天然支持请求级字段 |
| 轮转 | `rotating-file-stream` 手动管道 | pino 官方 transport(pino-roll)在 Next bundler 下有 worker-thread 摩擦,rfs 管道法是 Next 生态通行解;pino 本体加 serverExternalPackages |
| 开发人读 | `pino-pretty`(devDependency) | 仅开发控制台启用;生产控制台保持原生 JSONL |

## 二、traceId 链路

```
客户端(可自带 x-trace-id)
  -> proxy.ts(全局入口):无则生成 uuid7,挂请求头,响应头回显
  -> route handler:headers() 读出
  -> server/shared/request-context.ts:AsyncLocalStorage(Node 官方,pino 生态标准)
  -> server/shared/logger.ts:mixin 每条日志自动携带 traceId
```

- 与 OTel 的 trace_id 并存(一个面向人排查,一个面向采样系统)
- proxy.ts 跑 Edge runtime,只做头操作不引入 pino

## 三、日志形态

| 诉求 | 实现 |
| --- | --- |
| 人类阅读(开发) | `NODE_ENV=development` 控制台 pino-pretty(彩色单行) |
| 容器收集(生产) | 生产控制台原生 JSONL 直吐 stdout(docker logs/Loki/Vector 直接采) |
| 文件双写 | 设 `LOG_FILE_DIR` 才开启;rfs:10M 或每日切分、maxFiles 14、可选压缩 |
| 容器部署正道 | stdout-only + 收集器管轮转/保留;文件轮转服务于自托管裸机(P4 双形态对应) |

字段规范:`time, level, msg, traceId, userId?, chatId?, service="chatnest", mod`。
脱敏红线(工程纪律第 5 条):redact `authorization, cookie, *.apiKey, *.token, *.password, *.secret` 及环境密钥名,命中即 `[Redacted]`。

## 四、落点与渐进采用

- 新增:`server/shared/logger.ts`(工厂 + 单例 + getLogger(mod))、`server/shared/request-context.ts`(ALS);proxy.ts 三行;chat/agent route 包一层 runWithTraceId
- 存量 `console.*` 不强改;新代码一律 logger(biome noConsole 维持关闭)
- 依赖:+pino、+rotating-file-stream、-D pino-pretty;serverExternalPackages += pino, rotating-file-stream
- 环境变量:`LOG_LEVEL`(默认 info)、`LOG_FILE_DIR`(空=不写文件)入 deploy/.env.example

## 五、验收

- 离线单测(入白名单):ALS 隔离性;JSONL 每行可解析且字段齐;traceId 经 mixin 注入;redact 生效;工厂可注入测试流
- 冒烟:curl 带/不带 x-trace-id 打 /api/agent -> 响应头回显、(设 LOG_FILE_DIR 时)jsonl 落盘且每行含 traceId;dev 控制台 pretty、production 模式 JSONL

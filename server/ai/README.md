# ai 域模块(模型网关)

垂直域模块,不按 domain/application/infrastructure 拆分(P5 拍板):providers 是基础设施适配,
tools 是领域服务,model-settings 自带仓储,强拆三层弊大于利。

## 职责

- `providers.ts` / `model-connection.ts`:模型连接解析与 LanguageModel 适配(OpenAI 直连 / Gateway)
- `tools/`:供 chat 用例挂载的 AI 工具(create/update/editDocument、resultTable、suggestions)
- `model-settings/`:托管模型设置(自有 repository,经 withModelSettings 运行时注入)
- `prompts.ts` / `telemetry.ts` / `entitlements.ts`:提示词、仅元数据追踪、用户配额

## 依赖约定

- 可依赖:domain/**、shared/**、artifacts(单向 artifacts<-ai)、infrastructure 仓储实现
- 禁止依赖:@/app/**、next/server|headers|navigation(biome R2 全 server 生效)
- 被依赖方:application/chat(send-message 挂载 tools)、agent(runtime)

## 变更注意

- model-settings 加密存储与 runtime 注入链路敏感,改动必须离线套件全绿

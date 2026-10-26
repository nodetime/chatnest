# uploads 域模块(私有上传与文档摄取)

垂直域模块(P5 拍板):service 承载业务+持久化,local-store 是存储基础设施,validation 是入站安全。

## 职责

- `service.ts`:上传资产的生命周期/配额/属主校验与消息落库衔接
- `validation.ts` / `security.ts`:有界读体、图片校验、来源校验(入站安全)
- `document-parser.ts` + `document-worker.cjs`:受限 worker 内的 PDF/Office/CSV 摄取
- `context.ts` / `document-budget.ts` / `read-attachment.ts`:模型上下文装配与预算
- `local-store.ts`:本地私有存储驱动(Vercel Functions 上拒绝)

## 依赖约定

- 可依赖:domain/**、shared/**
- 禁止依赖:@/app/**、next/*(biome R2)
- 被依赖方:application/chat、ai/tools、agent

## 变更注意

- 原始文件绝不进 public/;配额与关联校验的顺序有测试断言(private-uploads.test.ts 源码顺序断言)

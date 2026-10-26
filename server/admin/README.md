# admin 域模块(平台管理)

薄垂直域模块(P5 拍板)。

## 职责

- `overview.ts`:/admin 概览的真实就绪度读取(不做模型调用、不做活跃连接探测)

## 依赖约定

- 可依赖:domain/**、shared/**
- 禁止依赖:@/app/**、next/*(biome R2);管理鉴权在 app 层(/api/admin/** 独立守卫),本模块不做鉴权

# 数知探AI：UI 调整专题

分支：`feat/ui-refinement`。创建于 2026-11-10。

本目录集中存放这轮 UI 调整的任务说明、位置清单、线框图与素材。每项任务使用独立 Markdown，正文控制在约 300–1000 字；相关资料按任务编号放入 `assets/`。后续任务由用户逐项提出，不提前编造需求。

| 任务 | 文档 | 当前交付 |
| --- | --- | --- |
| 01：Logo 透明背景 | [任务说明](01_Logo透明背景.md) | [透明纯矢量 SVG](../../../public/brand/radar.svg) 已替换共享资源，保留蓝青色与用户选定造型；系统图标同步派生 |

```text
20261110122513_UI调整/
  README.md
  01_Logo透明背景.md
  assets/
    task-01/
      logo-original.png       用户提供的外观参考
      logo-transparent.png    透明 PNG 对比参考
      surface-map.svg         页面位置线框图
      component-map.svg       组件与正式资源引用结构
```

任务 01 以用户于 2026-11-10 拷贝的雷达图片确定外观，复用原始 Figma 矢量路径生成正式 SVG，保留蓝青配色、浅色圆环和白色十字。页面继续通过 `BrandMark` 引用 `/brand/radar.svg`。正式资源放在 `public/brand/`；本目录的 PNG 仅供来源核对与效果比较。接入范围与实际验收结果见任务说明。

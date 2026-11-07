---
name: copy-skills
description: 在同一项目的 .claude/skills 与 .agents/skills 之间双向复制技能。用户要把 Claude Code 项目技能拷给 Codex、把 Codex 技能拷回 Claude Code，或比对两端技能差异时使用。
---

# 项目技能双向复制

使用本技能附带的 `scripts/copy-skills.mjs`，需要 Node.js 22.13 或更新版本，无第三方依赖。两端存放真实目录副本，各自独立修改。

## 执行步骤

1. 确定项目根目录和源端：`--from claude` 表示 `.claude/skills` -> `.agents/skills`；`--from codex` 表示反向。
2. 默认先比对，查看 JSON 报告中的技能名、文件路径和差异。用户只要求查看时到此结束。
3. 用户已要求复制时加 `--apply`。有冲突就保留目标并汇报；只有用户明确允许覆盖时才加 `--overwrite`。
4. 汇报已复制、跳过和冲突的技能。验证目标端存在 `SKILL.md`；若用户要求宿主验收，再检查相应工具是否发现技能。

脚本路径以当前加载的本技能目录为准。下面命令均在项目根目录执行，也可用 `--root "项目路径"` 指定其他项目。

## 常用命令

Claude Code 端，比对并复制给 Codex：

```bash
node .claude/skills/copy-skills/scripts/copy-skills.mjs --from claude
node .claude/skills/copy-skills/scripts/copy-skills.mjs --from claude --apply
```

Codex 端，比对并复制回 Claude Code：

```bash
node .agents/skills/copy-skills/scripts/copy-skills.mjs --from codex
node .agents/skills/copy-skills/scripts/copy-skills.mjs --from codex --apply
```

只处理一个技能，或明确覆盖差异：

```bash
node .claude/skills/copy-skills/scripts/copy-skills.mjs --from claude --skill dev-env --apply
node .claude/skills/copy-skills/scripts/copy-skills.mjs --from claude --apply --overwrite
```

## 比对与复制规则

- 只处理包含 `SKILL.md` 的技能目录，完整复制正文、脚本、引用资料和二进制资源。
- 源端新增技能直接复制；两端文件相同则跳过。
- 同名技能存在源端新增或修改文件时，默认报冲突；`--overwrite` 才应用源端内容。
- 目标独有技能或文件始终保留，不做删除或三方合并。
- 不创建或跟随符号链接、目录联接；遇到 `.env*`、私钥等敏感文件直接报错。全部预检通过后才开始复制。
- 忽略 `.git`、`node_modules`、`__pycache__`，不搬运仓库元数据和依赖缓存。
- 退出码：`0` 表示正常完成比对或复制；`1` 表示参数、文件或路径错误；`2` 表示复制时存在未获覆盖许可的冲突。
- 报告 `status` 包括 `missing`、`same`、`different`、`target-only`、`target-extra`；`action` 表示本次实际执行结果。

这是原样文件复制。Claude Code 专用的 hooks、fork、工具名和目录写死路径等，仍需按目标宿主检查适用性；复制成功不代表这些能力自动兼容。

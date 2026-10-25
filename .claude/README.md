# .claude/ - Claude Code 项目配置

Claude Code 专属配置。跨工具(Codex/Claude)共享的资产不放这里,放 `.agents/`;给人看的项目文档放 `docs/`。

## 槽位

| 槽位 | 用途 |
| --- | --- |
| `settings.json` | 权限模式:全量放权(`defaultMode: bypassPermissions`,2026-10-25 用户明确确认),所有工具调用免确认 |
| `skills/` | 技能真源所在地;`.agents/skills/` 通过链接映射给 Codex 等协作者(见 .agents/skills/README.md) |
| `commands/` | 项目级斜杠命令,出现高频固定操作时再建 |

## 约定

- 项目内不建 CLAUDE.md(会遮蔽根 AGENTS.md,见 AGENTS.md 工程纪律约束第 9 条)。
- `worktrees/` 是隔离工作区(gitignored),不属于仓库内容。

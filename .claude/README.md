# .claude/ - Claude Code 项目配置

Claude Code 专属配置。跨工具(Codex/Claude)共享的资产不放这里,放 `.agents/`;给人看的项目文档放 `docs/`。

## 放什么 / 不放什么

| 槽位 | 用途 | 判定 |
| --- | --- | --- |
| `settings.json` | 项目级权限白名单等 | 只放 Claude Code 需要的 harness 配置,起步保持最小 |
| `skills/` | Claude 专属技能(SKILL.md 带 Claude 语法) | 工具中立、双工具都要用的技能 -> `.agents/skills/` + 此处薄包装或直接引用 |
| `commands/` | 项目级斜杠命令 | 同上判定 |
| `agents/` | Claude 子代理定义 | Claude 独有机制,专属 |

## 约定

- 新增权限遵循最小可用原则,加一条验一条。
- 首个候选技能:把 AGENTS.md 里的本地启动序列固化为启动技能(可用 /run-skill-generator 生成)。
- 项目内不建 CLAUDE.md(会遮蔽根 AGENTS.md,见 AGENTS.md 末尾说明)。

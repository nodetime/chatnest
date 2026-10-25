# skills/ - 跨工具共享技能

真实文件在 `.claude/skills/<name>/`;本目录通过链接映射,供 Codex 等工具的协作者访问。真源唯一,不复制文件。

各平台建立映射(每人本机执行一次,链接不入库):

```bash
# macOS / Linux(真符号链接)
ln -s ../../.claude/skills/dev-env .agents/skills/dev-env

# Windows Git Bash(免管理员的目录联接 junction)
cmd //c "mklink /J .agents\\skills\\dev-env .claude\\skills\\dev-env"

# Windows 开启开发者模式后也可用真符号链接
```

注意:Windows 下 junction 不能提交进 git(会被当成实体目录造成双份文件),`.gitignore` 已忽略 `.agents/skills/dev-env/`。

当前映射:dev-env(开发基座闭环,用法见 `.claude/skills/dev-env/SKILL.md`,或直接 `pnpm dev:up`)。

# skills/ - 跨工具共享技能

真实文件在 `.claude/skills/<name>/`;本目录以 git 符号链接条目映射(真源唯一,不复制文件),供 Codex 等工具的协作者访问。

各平台 clone 后的表现:

- macOS / Linux:直接就是可用的软链接,无需任何操作
- Windows(未开开发者模式):得到一个含目标路径的文本占位;需要真实映射时执行
  `cmd //c "mklink /J .agents\\skills\\dev-env .claude\\skills\\dev-env"`(免管理员;git status 会显示 typechange,属预期)或开启开发者模式后重新 checkout

当前映射:dev-env(开发基座闭环,用法见 `.claude/skills/dev-env/SKILL.md`,或直接 `pnpm dev:up`)。

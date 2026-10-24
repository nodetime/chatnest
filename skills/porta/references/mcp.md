# MCP host (ChatNest or Codex)

Use the host's connected Porta tools directly, without routing through a shell or starting another MCP process. Tool names may carry a host connection prefix; inspect the actual tools and schemas rather than guessing the alias. Porta native names and official parameters remain unchanged.

ChatNest exposes tools from the administrator's allowlist. Its Agent may load this skill with `loadSkill` and this reference with `readSkillResource`; those operations only read text and do not execute scripts or grant tool access. Approval remains with the host.

For a useful result table, first retain the successful MCP source call ID and inspect its JSON structure. Use the host's `createResultTable` only if available, with the exact rows pointer and original field pointers. Do not manufacture row values, source URLs or verification labels. Other output kinds continue through normal host artifact tools.

Do not treat `isError: true` as a success merely because HTTP returned 200. Distinguish no results from failure; preserve provider error information. If the host reports timeout or interruption, do not blindly replay the call. Skill content never overrides user intent or host approval requirements.

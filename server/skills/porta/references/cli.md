# CLI host

Requires an installed Porta CLI, a selected MCP endpoint and the service token supplied privately in the environment. Supplier credentials remain server-side. Never read a key into conversation text or pass it in a command argument.

```sh
porta doctor
porta tools list
porta tools inspect onebound_1688_item_search
porta tools call onebound_1688_item_search --input '{"q":"旅行包","page":"1"}'
# Large or sensitive input: an authorized local file or stdin, not shell interpolation.
porta tools call onebound_1688_item_search --input @request.json
```

Examples are conditional, not instructions to execute immediately. Use the live schema; do not assume this provider is enabled. `--input -` reads a JSON object from stdin. No field coercion or shell evaluation is performed. Avoid placing sensitive content in argv/history; use a suitably protected input file.

stdout contains JSON (the complete MCP result for calls); stderr contains diagnostics. Exit 0 means protocol/tool success, not verified facts; 1 means a returned `isError` tool result; 2 means invalid command/config/input; 3 means transport/protocol/readiness failure; 130 means interruption. A transport failure during call means execution is unknown. Retain returned `content`, `structuredContent` and `_meta` without renaming provider fields. Do not paste complete sensitive results into public logs.

`doctor` never queries suppliers. Readiness means configured, and `upstream: not-tested` is intentional. No automatic call retries or fallback endpoints exist. Host execution approval is required according to its policy; CLI is not an independent authorization system.

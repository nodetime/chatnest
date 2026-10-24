# Live runtime interaction verification

## Scope and behavior

Continue the approved generic workbench design through actual runtime states. No provider workflow is hardcoded. Approval uses exact canonical IDs; same-mounted-event double/stale callbacks are guarded. Recovery appends a normal user message asking the Agent to assess prior side effects and choose retry, another approach or clarification; it does not directly replay tools, clear failed messages or reuse authorization.

## Actual local browser flow

All model and MCP responses below are controlled synthetic HTTP fixtures. These checks prove integration/state transitions, not real-model reasoning or supplier reliability. No paid APIs/customer documents were used.

1. Sent a fresh request through the chat input. Observed preparation and the existing stop control.
2. Before allowing the generated MCP request, verified server call count unchanged. Approval card shows operation, actual origin/parameters and access to raw details without the long technical alias inline.
3. Allowed it. Captured the genuine 8.5-second delayed execution: spinner, `执行中`, waiting text and stop action.
4. Fixture returned an error. UI displayed the expanded failure plus `让 Agent 继续处理`; raw error remains in details.
5. Selected recovery. Original failed call stayed in the conversation, a new normal user turn was appended, and a new approval appeared. MCP call count remained unchanged until the new approval.
6. Approved recovery. A new distinct MCP call succeeded, and the Agent-selected result-table tool persisted three source-backed rows. DB inspection verified both old failure and new success remain with separate IDs.
7. Requested readable table columns as a subsequent normal turn; the mock model selected the generic table tool using existing successful evidence. This is fixture input, not hardcoded product orchestration. Open/close/reopen and persisted source-backed rows were checked.
8. Separate denial flow: UI becomes `已拒绝` and no new MCP call occurs.
9. Separate stop flow: active call becomes `未完成`, not permanently running or falsely successful. Recovery remains available. Stopping client observation does not guarantee cancellation of remote side effects.
10. Forced model transport failure during recovery: existing error notice restores exactly the recovery request. Browser testing exposed an empty reply toolbar and raw generic English error; the follow-up fix hides only the empty final presentation (retaining its canonical keyed wrapper) and puts the exact error behind a closed detail disclosure. Repeating the failure in the actual browser confirmed the friendly summary, hidden empty actions, exact expandable error and successful input restoration.

Evidence under ignored `.local-review/`: `runtime-approval.png`, `runtime-running.png`, `runtime-failed.png`, `runtime-flow.json`, `runtime-data-evidence.json`, before/after MCP call-count snapshots. The dedicated localhost session uses synthetic fixture identity.

## Checks

Initial final runtime revision `4812941`: primary checkout serial offline suite 286/286, TypeScript and full-repository lint passed. Isolated `scripts/ci/offline-checks.sh build` passed, using closed-loopback sentinel configuration and no migrations. CI on PR #1 also passed lint, 286-test suite, typecheck and production build in Ubuntu loopback-only network namespaces. Follow-up edge-fix verification is appended below before merge.

CI no longer uses deployment DB/model/storage secrets. Retired legacy browser workflow had obsolete selectors and production-secret wiring; replacement is honestly named offline checks. Browser integration above was run manually via the app's browser tooling, not falsely attributed to automated CI.

## Review and boundaries

Independent focused review found no new blockers in approval/recovery/CI paths. Prior pending local workbench commits are included in the PR and received focused security triage, not an exhaustive audit. No local fixture credentials or customer files are committed.

Inherited limitation: server-side approval continuation lacks an atomic execution claim across concurrent requests/tabs. This change prevents duplicate actions within the same UI event, not cross-tab exactly-once execution. Runtime timeout/abort also cannot prove a remote operation had no effect; recovery explicitly asks the Agent to assess existing evidence.

## Final browser re-open

After leaving and reopening the acceptance conversation, the saved `候选资料 · 已恢复` artifact opened in the normal right-hand viewer with all three rows and readable column names. The original failed and successful calls remained in the chat. Screenshot: ignored `.local-review/runtime-reopened.png`; transport-error screenshot: `.local-review/runtime-transport-error.png`. The test draft was cleared and model/MCP fault controls reset.

## Final source verification

Follow-up runtime revision `2207236` was fast-forwarded into the primary checkout and independently verified there: explicit serial offline manifest **288/288 passed, 0 skipped**, `tsc --noEmit --incremental false` passed, full `ultracite check` passed (279 files). Independent focused review of the transport-error/empty-reply fix reported no blocking findings. Latest-head hosted CI is required before merge; no check or protection is bypassed.

# Tool-record interaction correction

- [x] Reproduce the user's exact PDF read page, trace nested UI and identify the untouched ToolActivity result body.
- [x] Read-only design review APPROVED after clarifying special-renderer boundaries, both grouping paths, falsey raw results and focus lifecycle.
- [x] One source writer: add failing behavior tests, flatten singleton activity, readable file-row context, direct evidence excerpts and a separate generic tool-detail Sheet. Preserve original Agent/approval/error evidence.
- [x] Independent spec and quality review; repair/recheck any blocker.
- [x] Root real browser on exact PDF + long DOCX/XLSX reads, keyboard/source/details/approval/error and multi-step regression. Retain normal artifact viewer.
- [x] Root named safe unit suites/types/changed-file lint/direct isolated production build; verify main locally after integration, no push claimed.


## Source cut and red-green sequence

One source writer owns `components/chat/{tool-activity,activity-group}.tsx`, optional scoped `components/ai-elements/tool.tsx`, new small attachment-evidence and generic tool-details components, `tests/unit/tool-records.test.ts` and intentionally replaced UI assertions in existing focused suites. Root owns docs/ignored fixtures/browser/build. No artifact layout or Agent runtime redesign.

1. Write and run failing actual-component tests for singleton composition/children, direct excerpts, malformed inputs and exact falsey/raw error evidence.
2. Keep the keyed tool subtree stable across singleton/multi transitions; omit singleton group chrome and use one accessible details Sheet outside result collapse.
3. Wire readable attachment output filename, bounded direct references, real partial/warnings; preserve canonical raw data and all approval/disclosure callbacks.
4. Update only intentionally replaced UI wording/structure assertions, run focused named suites and type/changed-file checks; source-only commit.
5. Spec review then quality review; writer fixes/rechecks blockers. Root browser at standard viewport first (avoid prior emulated-coordinate false negatives), then responsive media checks, full named offline suites and private direct production build. Primary checkout regression before completion.


## Browser-discovered lifecycle correction

Root reproduced the two-step live HTTP MCP completion twice on frozen source: the open details Sheet vanished without user dismissal. Group-local inspection was insufficient because the outer renderer changed component type when the assistant appended answer text. Choose the smaller structural correction: always render each canonical keyed PreviewMessage, retain grouping only inside that stable message. No cross-message Task reparenting and no global inspector/ref registry. Suppress meaningless no-text intermediate assistant action rows; retain real answer/artifact/regeneration actions. Add a transition harness and repeat the actual delayed browser case before approval.

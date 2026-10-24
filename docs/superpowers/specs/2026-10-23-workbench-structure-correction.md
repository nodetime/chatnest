# Workbench structure correction

The user rejected the previous screenshot as visually unchanged. Treat that as a failed visual acceptance, despite functional tests passing. This correction must visibly alter information hierarchy rather than only tokens.

- Results-first desktop proportions: default workspace68%, preserving explicit resize35–70%, sidebar preference and mobile overlay. Chat-only layout remains readable.
- Sent documents become compact filename/format attachments, grouped within the message; the composer/upload queue keeps its real status, errors, retry/remove and image previews.
- Row detail becomes readable content: actual record title, labelled values and exact source links. Raw JSON and technical provenance stay accessible but collapsed by default. No generated summary, fabricated grouping or inferred legal conclusion.
- First displayed record column becomes the frozen visual anchor; keep original field values and rows. Grid canvas, cells and header have distinct surfaces. Preserve inline38px and workspace42/46px geometry.
- Normal artifact header uses a single filename/type line; idle timestamp goes into contextual metadata. Pending save/generation/error states remain visible. Keep normal generic text/code/image/table renderers and existing switching guards.
- Agent/runtime/approval/disclosure reconciliation remains untouched. No fixture flow in production source.

Acceptance: compare same1440×900 viewport, same conversation, same filter and records before/after; inspect both whole page and row details. Run focused behavioral tests, full explicit safe suite, type/lint checks, production build and primary regression. Tests alone are not a visual acceptance. Screenshot limitations and mock-model use must remain explicit.

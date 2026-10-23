# Structural correction acceptance

2026-10-23 — implementation `a87fc45`, baseline `76a1bcf`.

The user rejected the preceding visual delivery. This pass changes information hierarchy, not just color:68% results pane,160×40 sent-document attachments, single-line artifact header, frozen/emphasized first record column, visible grid canvas/borders, and content-first row details with technical provenance collapsed.

## Verification

- Root explicit safe suite:278/278; TypeScript and scoped lint passed. Primary main repeated278/278 and TypeScript after fast-forward.
- Isolated direct Next production build passed without the migration-running build script.280 runtime files match preview checkout/main/build snapshot.
- Independent quality review approved; checked exact field values/safe links, compact-mode boundaries, inline geometry and pending/error branches.
- Same1440×900 viewport, same conversation and filtered records were captured before/after. Before screenshots: `.local-review/structure-before-1440.png` and `structure-before-detail-1440.png`; after screenshots use `structure-after-1440.png` and `structure-after-detail-1440.png`.
- Real browser: record title/labelled values/source link appear before any raw metadata. Technical details start closed and expose original JSON/source IDs when expanded. Notes draft still blocks switching; an actual save created version3, and production preview reopened its exact note. Immutable rows/source remained identical to version1.
- Real browser: mobile390px has no body overflow; three compact documents wrap into two rows; details close normally back to the table and chat. Generic text/code switching and dark code/table presentation checked. No captured console error entries at final preview.
- The original upload/read3→skill/reference→approvedHTTPMCP→native table fixture conversation was reused unchanged for visual comparison; its stored read/source evidence was rechecked. No new paid/model-provider validation claim is made.
- Found persistent stale Turbopack CSS: both browser CSSOM and direct local CSS response still contained old header/border rules after source edits and normal restart. Moved only owned `.next/dev` into `.local-review/structure-stale-dev-cache`, restarted fixture service, and verified computed gray canvas/white header/nontransparent cell borders. No user action required and no CSS!important workaround.

Temporary production preview stopped after acceptance. Development preview remains. No push or commercial data/model calls.

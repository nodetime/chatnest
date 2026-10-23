# Reader-first results verification

## Scope

- Successful tool previews show actual titles, returned prose and associated sources. Raw `item_id`, `price`, `seller` and other structured fields remain in exact call details, not reader cards.
- No invented summaries. Approval retains exact tool identity and parameters. Agent scheduling, MCP contracts, evidence and artifact protocols are unchanged.
- Process rows no longer repeat successful-state badges or timeline checks. Skill-loaded, approval, denied and error states remain explicit.
- Artifact workspace defaults to 50%, remains resizable, and retains normal text/code/sheet renderers. Result table source labels use domains; URLs, raw data and exports are unchanged.

## Independent review and corrections

- Spec review approved the scope and implementation.
- Quality review reproduced blank prose and lost snippet-only results; `48072f1` fixed both with rendering regressions.
- Root browser found duplicate generic-result hints; `09448f3` replaced them with one details fallback while retaining empty/mixed-content warnings.
- Independent quality re-review approved; 82 focused tests passed.

## Root verification

| Check | Actual result |
| --- | --- |
| Explicit safe suites | 275/275 passed; no all-unit glob |
| TypeScript | Passed, incremental disabled |
| Changed-source lint | Passed, 9 included files; generated AI Elements component also reviewed and built |
| Production build | Direct isolated `next build --webpack` passed; no migration-bearing package build |
| Commodity search preview | Title/source only; original fields present in details |
| Web search preview | Real snippets and linked titles; fifth source remains in full details when preview is partial |
| Seven fresh HTTP MCP cases | Sources, empty, text, mixed, falsey, denied, failed; approval required, denied executes zero remote calls |
| Browser approval and live details | Exact identity and `q` shown before approval; one actual mock call after approval; open details updated from missing output to complete result, Escape restored focus |
| Artifact save/reopen | Saved new note; reloaded third version with filter retained; raw rows/source equal first version |
| Generic artifact switching | Saved text, Python code and editable CSV reopened through normal picker |
| Responsive / keyboard | Actual 390px light/dark and 1440px screenshots reviewed; resize 50→55→50, details via keyboard and focus return verified |
| Production browser | Actual summaries/source display and complete fifth source in details passed; missing runtime alias mapping correctly used canonical name |

All calls used synthetic local fixtures, not real supplier or paid model services. PDF/Word/Excel ingestion was not changed; prior actual upload/read records were checked for preservation, not counted as new uploads in this turn.

## Local evidence

Ignored `.local-review/` evidence: `unified-reader-final-units.log`, `unified-reader-final-types.log`, `reader-build-final.log`, `reader-tool-cases.json`, `reader-pending.json`, `reader-data-evidence.json`, `reader-mobile-light.png`, `reader-mobile-dark.png`, `chatnest-reader-results-final.png`.

No push or deployment was performed. Primary-checkout regression and source parity are recorded after the local fast-forward merge.

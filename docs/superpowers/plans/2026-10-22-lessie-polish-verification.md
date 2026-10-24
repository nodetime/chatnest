# ChatNest workbench polish verification

Verified by the root session on2026-10-23. Source commit:40824f1 (implementation7b41cc3 + preview lifecycle f93286f + accessible splitter40824f1).

## Scope

General Codex/Manus-like Agent shell; scenario customization remains prompt/MCP/skills. No runtime routing, original evidence, persistence, approval semantics, administrator layout, Porta, migrations or dependencies changed. This is presentation polish, not a claim of parity with commercial Agent products.

## Independent checks

| Check | Result |
|---|---|
| Explicit safe offline unit suites |233/233 pass; excludes database-backed regeneration and browser-runtime suites |
| TypeScript |tsc --noEmit --incremental false: pass |
| Changed TypeScript/TSX formatting |16 files pass |
| Production build |Clean copied source + private dependency clone; next build --webpack passes,27 static pages; no migration command |
| Independent specification review |Approved at40824f1 |
| Independent code-quality review |Approved at40824f1 |
| Browser console |No error entries in development or compiled production acceptance |

## Real browser + isolated services

All files and rows were synthetic, model responses offline mocks, MCP a real local HTTP JSON-RPC service and persistence isolated PostgreSQL. No paid model/vendor requests or customer files used.

- Browser file chooser uploaded PDF/DOCX/XLSX; all became text-ready with actual size/format warnings. Agent invoked optional readAttachment on a late DOCX segment, then dynamically discovered MCP search with original q argument. No MCP call before approval; one after approval.
- Native optional createResultTable produced three original source rows. Filter1688, numeric priceDESC, hidden seller and independent notes were saved, refreshed and reopened. Original rows/source remained identical across two versions. Historical version has no save control.
- Actual downloads: CSV two current-view rows with formula escaping; JSON all three original rows, source, view and notes. Source drawer contains all six fields and returns focus on close.
- PDF two pages and XLSX late sparse/date cells were separately read via actual optional Agent tool over HTTP. Embedded images were honestly marked not analyzed.
- Native Agent tools produced text/code/plainCSV artifacts. Browser opened all three plus a separately seeded image-renderer-only fixture; no table filters leaked to other artifact kinds. Image rendering is not image-generation acceptance.
- Continuous text typing preserved focus and saved after reload. Only one editable text instance when that artifact was open. Header assistant menu dispatched the original request; a mock response elected only to answer, without forced document mutation.
- Same artifact closes/reopens, sources→artifact activation returns to documenttab, activecard reflects actual visible workspace. Actual-component/actual-hook regression was red before fix and green after.
- Splitter has900px desktop height/8px hit area, keyboard60→65→60, actual pointer drag62.5; expand/return works. Mobile close returns to composer and samecard reopens full390px pane. Keyboard tabEnd selects sources.
-390/1280/1440px, light/dark: body width equals viewport in all six final screenshots; desktop splitter full height, intentionally hidden on mobile. Home empty state also checked at390/1440.
- Persisted rejection, provider failure and native table validation failure remain visible and produce no artifact cards.
- Compiled production browser independently reopens code card, uses header menu/keyboard splitter and loads saved table. Temporary production server stopped; development preview retained. Temporary viewport/media overrides reset.

Ignored `.local-review/` retains actual screenshots, source/build paths and synthetic fixture assertions. No credentials or private fixture internals are committed.

## Remaining boundaries

Not live provider/model quality acceptance, cloud deployment, OCR, background durable tasks or generating-stream resume. Skills bundles were not changed as part of this generic presentation pass. Existing product methods remain dynamically discoverable rather than a mandatory industry pipeline.

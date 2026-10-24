# Lessie-inspired workbench — acceptance

Date: 2026-10-23. Runtime implementation: `d810758` (includes `1b1ee29`, `1882f51`).

## Scope and review

Whole ChatNest presentation: coordinated neutral/mint palette, compact sidebar, aligned 52px headers, chat/input spacing, broad resizable generic artifact pane, table toolbar and independent notes Sheet. No Agent/provider/approval/schema changes; no new dependencies. Porta unchanged.

Reference inspected in the authenticated Lessie workspace and an existing task, plus the public showcase. No searches, paid actions or outreach were submitted. This is a visual reference, not a claim of feature parity.

Independent spec review passed. Independent quality review found an inline-preview geometry regression; fixed by keeping inline 38px headers/rows while the full workspace uses 42/46px. Follow-up review approved `d810758`. Root additionally tightened column defaults after seeing excessive horizontal overflow in the actual browser.

## Fresh verification

| Check | Result |
| --- | --- |
| Explicit offline safe suite, live checkout | 276/276; 0 failed |
| TypeScript, live checkout | Passed |
| Scoped lint | 12 changed TS/TSX files passed |
| Direct isolated Next production build | Passed; no migration-running build script used |
| Primary `main` after fast-forward | Same 276/276 and TypeScript passed |
| Runtime file hash comparison | 279 files identical in live checkout, primary main and production snapshot |
| Browser console at final preview | No captured error entries |

## Actual browser acceptance

Fresh conversation `bec8f8a5-25c6-415f-ab48-64bb0c81d655`:

1. Uploaded synthetic `two-pages.pdf`, `长篇材料.docx`, `完整商品资料.xlsx` through the attachment menu; all reached readable state.
2. Mock model selected the real native `readAttachment` tool three times, then `loadSkill`, `readSkillResource`, the discovered HTTP MCP search tool and `createResultTable`. The fixture model selects calls; production Agent code has no fixed task sequence.
3. Browser approved the exact MCP request. Remote fixture calls increased from 15 to 16; approval preceded the call. Native table creation used the actual tool-result reference.
4. Saved filter `1688` and a personal note. Closing/reopening the notes Sheet kept its draft and returned focus. After saving, the save control disappeared; refreshing and reopening restored the filter and note.
5. Database verification found two table versions with identical original rows/source metadata. Read results contain PDF page refs, DOCX paragraph refs and XLSX cell refs/date/OCR caveat.
6. Source and raw-row drawers retain exact fields, original URLs and the unverified-source caveat. Main search preview shows titles/source rather than raw field dumps.
7. Downloaded actual CSV and JSON through the toolbar: CSV contains two filtered records and five displayed columns; JSON preserves all three records and saved notes.
8. Existing generic text, code and ordinary CSV artifacts opened/switched normally. The right side remains the shared artifact viewer, not a table-only surface.
9. Checked light/dark, reduced motion and 390px mobile chat/table/notes. Mobile body width stays 390px; table overflow stays inside the workspace. Closed the overlay to return to chat successfully.
10. Production server on temporary port 33382 reopened the same saved artifact and note. Temporary production server/tab were then stopped/closed; development preview remains available.

Seven additional fresh HTTP fixture scenarios passed: source records, empty result, plain text, mixed content, falsey values, denial and failure. Denial executed zero remote calls; other cases executed one. None generated a table automatically. Browser inspected failure and denial messages. The test fixture initially hit the normal hourly message quota; only synthetic message timestamps in the isolated fixture database were moved outside that window before rerunning. Product quota policy was not altered.

Notes/CAS failure, readonly, pending switch guards and inline geometry also have automated behavioral regressions. Not every automated edge case was repeated manually in the browser.

## Evidence and limits

Ignored local evidence under `.local-review/`: `lessie-v2-data-evidence.json`, `lessie-v2-tool-cases.json`, `lessie-v2-source-parity.json`, `lessie-v2-production-build.log`, `unified-lessie-v2-final-units.log`, `unified-lessie-v2-main-units.log`, and `chatnest-lessie-workbench-final.png`; mobile/dark screenshots use the `lessie-v2-` prefix.

All input documents, accounts, model responses and MCP records were isolated fixtures. The HTTP/tool/upload/persistence/UI paths are real; these tests do not validate a paid model's judgment or a commercial data provider's availability. No customer documents, real vendor calls, paid model calls or GitHub pushes were used.

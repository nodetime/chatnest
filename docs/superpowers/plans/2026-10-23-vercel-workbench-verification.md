# Vercel-backed workbench verification

## Scope and provenance

- Implementation commits: `6f8e877` and `81cd4bd`, based on `b4b09f9` planning / `918d108` preceding workbench.
- Actual official reference: [Vercel Chatbot template](https://vercel.com/templates/next.js/chatbot) and its [demo](https://chatbot.ai-sdk.dev/demo), viewed in a real browser. Existing local project already descends from Chatbot; this pass changes composition rather than claiming a wholesale template migration.
- Actual new primitives: [Artifact](https://raw.githubusercontent.com/vercel/ai-elements/ca8be600bfd01b3131f9bf6134b51602a71f4374/packages/elements/src/artifact.tsx) and [Task](https://raw.githubusercontent.com/vercel/ai-elements/ca8be600bfd01b3131f9bf6134b51602a71f4374/packages/elements/src/task.tsx), fixed upstream `ca8be600bfd01b3131f9bf6134b51602a71f4374`, Apache-2.0 with full license/source/modification notices. Existing Conversation/PromptInput are actually composed. No dependency/runtime upgrade.

## Independent checks

| Gate | Actual result |
| --- | --- |
| Spec review | Initial blocker found: result-table notes/view dirty was separate from generic editor dirty. Fixed via original dirty/saving projection, re-reviewed APPROVED. |
| Quality review | Independent read-only review APPROVED; lifecycle, per-chat identity, catalog, metadata, preserved modes/editor/approval boundaries and license checked. |
| Root safe offline tests | 242/242 passed, explicit named suites; never the all-unit wildcard. Logs ignored under `.local-review/vercel-root-final-units.log`. |
| Types / formatting | `tsc --noEmit --incremental false` passed; changed-file ultracite checked19 files, no fixes. |
| Production build | Clean temporary source copy and private APFS dependency clone; direct `next build --webpack` exit0. No migration wrapper, real environment or supplier credentials. |
| Production browser | Built app on own33382: persisted title, four native files in chooser, code→text selection, edited content and close/reopen; exactly one workspace header. |

## Actual CUA browser acceptance

| Surface | Evidence/result |
| --- | --- |
| General artifact navigation | Actual native Agent created text, Python code and CSV in one chat. Keyboard chooser switches kinds; refresh rebuilds four-file catalog after additional streamed text. No global old-chat membership. New chat artifact list empty. |
| Text editing | Real ProseMirror typing immediately disables chooser and displays save reason; persisted text confirmed in DB, normal switch/reopen and production reader. |
| Table editing | Real notes + filter disables chooser; save releases lock; text→table restores notes/filter. DB two versions preserve all3 original rows/source; CSV current view2 rows, JSON complete3 rows downloaded and compared. |
| Mode/visibility | Source and document mode menu, close/reopen and mobile close verified; one64px header. Native row/source details remain available and explicitly unverified. |
| Attachment + HTTP MCP | Three real browser uploads (synthetic PDF/DOCX/XLSX) show ready extraction; XLSX embedded-image/no-OCR warning retained. Model-selected readAttachment reads DOCX segment41 sentinel, then pauses for real HTTP MCP approval. Calls remained1 baseline before approval,2 after approval; native optional table created from actual tool evidence. |
| Streaming/reading | Mock SSE long reply8312 chars; after user scroll, top2870 stayed while total height5044→6404. Jump-to-latest works; second reply stopped, input recovered. Edited user turn persisted. Separate streamed native document disables chooser during generation; completion restores selection and all31 headings survive reopen. |
| Abnormal persisted states | Existing synthetic denied call renders已拒绝; failed supplier and native table error render失败 with no false artifact completion. This checks renderer regression, not new paid-provider failure tests. |
| Responsive/theme |390×844,1280×720,1440×900, light/dark actual screenshots; no outer horizontal overflow, exactly one visible64px workspace header and in-viewport close target. Mobile table scroll is local, not page overflow. |

Root fixtures, screenshots and private logs remain ignored. Temporary viewport/media overrides restored. A simulated-viewport click mismatch was resolved by returning to the standard viewport; actual message editing and actual handler chain work, no speculative production fix.

## Limits

- All model/MCP/data are local synthetic fixtures; no paid supplier/model requests or customer materials. Mock tool decisions live only in ignored fixture code, not production Agent flow.
- This pass preserves general Agent selection; it does not add a fixed legal/research pipeline, AG-UI protocol, durable background jobs, resumable execution, OCR, cloud storage or commercial-agent parity.
- New chooser guards unsaved edits; original message-card navigation follows its pre-existing behavior. Wider navigation/unload confirmation is separate scope.
- Source branch/worktree and running isolated dev preview retained. No remote push/deployment claimed.


## Local integration

- Fast-forward integrated into local `main` after browser/build/review gates. Root reran the full explicit safe unit list in the primary checkout: **242/242 pass**, then `tsc --noEmit --incremental false`: exit0.
- Compared all263 runtime/config source files across primary `main`, live preview worktree and the built production copy: zero hash mismatches. No dependency, runtime prompt or Agent selection changes.
- Primary and feature worktrees clean after docs-only verification record. Main remains local; no remote push or deployment performed. Production smoke server33382 stopped; own isolated33378 preview remains with mock model/MCP. Final actual screenshot and interactive artifact page retained.

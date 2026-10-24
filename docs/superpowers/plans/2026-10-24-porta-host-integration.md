# Porta host integration

Approved continuation: install the canonical Porta skill and use existing host capabilities, not a new execution engine.

## Implementation and verification

- [x] Export the pinned Porta skill into ChatNest `skills/porta`; include source revision and file hashes for review and updates. Test real discovery/references and integrity in offline CI.
- [x] Install the same skill into the local Codex project and install the packed Porta CLI. Configure a dedicated profile using environment-token references, not embedded credentials.
- [x] Configure a real local Porta MCP service with clearly labelled synthetic supplier responses, an isolated ChatNest database/storage, existing per-call approval and a real model connection. Never enable mock-model flags for this acceptance.
- [x] Run a Codex task through the installed CLI; let the Agent inspect native schemas and choose its calls. Save evidence and a useful report.
- [ ] Run ChatNest through normal upload/chat/approval/artifact/reopen paths with a real model. Do not inject tool selections or substitute a scripted model. Report external model failures separately.
- [ ] Run focused and full checks in the primary checkout, independent review, CI, PR and merge. Only mark live acceptance complete with observed model-selected calls and saved/reopened output.

No ChatNest shell runner, hidden automatic billing, new provider implementation, or fixed search-to-table workflow. A supplier fixture is allowed for wiring acceptance but must remain explicit and isolated from production. A model outage is not acceptance success.

Actual ChatNest task attempted with three extracted uploads; real model gateway returned 502 before tools. The live task checkbox remains open. Fixed the discovered missing persisted failure status and added SDK/UI regression tests; no scripted-model substitute.

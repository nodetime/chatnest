# Runtime interaction polish

Continuation of approved generic Lessie-style chat design, now covering live states.

Goal: natural running, approval, failure and recovery without a provider-specific scripted UI.
Architecture: retain canonical SDK messages, existing approval transport and Agent-selected tools. Show actual state, not fake progress. Existing generic artifact renderers remain unchanged.

- [x] Inspect current running/approval/error/retry paths; add regression coverage before fixes.
- [x] Calm accessible in-flight status; pending approval is not an indefinite spinner. Preserve stop, disclosure and raw detail focus.
- [x] Approval action pending guard, local submission feedback/error recovery; exact approval ID and args remain unchanged. No repeated approval dispatch.
- [x] Failure has human-readable summary/raw detail separation and useful recovery. Recovery asks Agent to reconsider in a normal conversation, never blindly replays side effects or loses original failed evidence. Honor readonly/busy/historical guards.
- [x] Root isolated HTTP model+MCP fixture runs actual request, approval, delayed tool, error, recovery and generic artifact creation; also denial/stop where appropriate. Mock only, no actual vendor costs.
- [x] Independent code review, safe explicit serial suite, types/lint, isolated no-migration production build and primary checkout verification.
- [ ] Audit PR delta (includes preceding local approved UI commits). Ensure CI never uses deployment database/secrets: isolated disposable services and explicit offline tests. Create PR, attach it, await checks and merge without bypassing protections; verify main SHA.

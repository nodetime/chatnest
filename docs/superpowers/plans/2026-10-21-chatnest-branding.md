# ChatNest display-name consistency

Approved scope: use ChatNest for customer UI, title, administration and conversation exports. Porta must remain byte-for-byte unchanged. This is one coupled branding change, not parallel module development.

1. Add failing offline regressions for the root title (ChatNest), admin title (ChatNest Admin), home label, admin identity and conversation Markdown/download filename. Preserve content/source links and verify Porta config stays unchanged.
2. Replace the old product label in app/layout.tsx, app/admin/layout.tsx, components/chat/app-sidebar.tsx, components/admin/admin-shell.tsx, components/chat/conversation-sources.tsx and lib/agent/conversation-sources.ts. Update current DEVELOPMENT.md branding and affected visual test locators. Do not rename internal browser globals/temp paths, model identifiers, third-party text, historical plans or user message contents. No migrations or unrelated feature changes.
3. Run focused tests, existing 109-test safe suite, tsc, targeted Biome and diff checks. Root independently verifies homepage/admin titles and labels in the actual local preview, plus a real conversation export filename/content. No real model/vendor calls or private materials. Spec review then quality review; commit locally only after verification. Reconcile primary checkout to the verified commit and rerun tests there.

## Completed verification

- Five new branding regressions and the existing admin-shell SSR assertion were observed RED before the minimal implementation, then GREEN. Writer and root independently passed all 114 safe offline tests, `tsc --noEmit --incremental false`, targeted Biome on eight source/test files and `git diff --check`; the two updated Python visual locators also passed syntax checks.
- Root verified the real local homepage title `ChatNest` and `ChatNest 首页` button, plus the admin storage title `ChatNest Admin` and sidebar identity `ChatNest / Admin`. A real UI export downloaded `chatnest-82c10dae.md` with `# ChatNest 对话记录` and preserved fixture user/assistant messages. Browser evidence and screenshots remain ignored under `.local-review/`.
- Porta configuration has no diff and its SHA-256 remained `1b013f736cd27dba18a209d071c831bf82c2a634ac3fb1692b619535d69e979e`. Internal browser prefixes, model identifiers, third-party content and historical plans remain unchanged. No migration/build wrapper, real vendor/model request or unrelated change was introduced.
- Spec review approved; quality review approved with no findings. Primary-checkout reconciliation and verification remain the root session's final integration step.

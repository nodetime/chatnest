# Chat detail polish — approved Lessie continuation

**Goal:** Unify sent attachments, tool activities and artifact entries into a light, coherent chat surface; preserve the approved two-pane composition and generic Agent/artifact capabilities.

**Architecture:** Presentation-only changes to chat components. One shared small file-symbol component may distinguish document/table/code/image formats. No provider/runtime orchestration changes or fabricated summaries/status. Keep exact evidence and disclosure identities.

- [x] Sent documents: adaptive one-line filename/format file chips, not a rigid160px tile grid. Keep authenticated image previews and upload queue statuses/remove/retry unchanged.
- [x] Assistant content: quiet ChatNest sender label for a readable transition from user request to answer/process, without repeated branding per tool.
- [x] Tools: one compact summary control with a light timeline when expanded; aligned icon/title/context/details, consistent typography and spacing. Completed steps stay quiet; approval/error/incomplete stay visible. Raw details remain accessible. Preserve mount/focus/reconciliation and exact arguments.
- [x] Artifacts: consistent lightweight file entry and open affordance for all four kinds; no large icon slabs or duplicate type/status badges. Prefer compact metadata/header over embedded editor/table in the chat; normal right-side renderers remain authoritative. Preserve genuine loading/generating/open state and exact chat/document identity.
- [x] Update targeted behavior/presentation tests to the new approved expectations, without deleting behavioral coverage. Root browser desktop/mobile check attachment wrapping, process/detail open-close, approvals/errors and generic artifact switching/reopening.
- [x] Run safe explicit regression suite, types/scoped lint and isolated production build, main verification. Screenshots from actual UI/mock fixtures, no commercial calls or customer data.

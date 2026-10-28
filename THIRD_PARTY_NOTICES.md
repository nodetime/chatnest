# Third-party notices

## next-shadcn-admin-dashboard

Source: https://github.com/arhamkhnz/next-shadcn-admin-dashboard

Commit: `487a741538e787113f24a6c291f606136e2a970a`

Vercel template listing: https://vercel.com/templates/next.js/next-js-and-shadcn-ui-admin-dashboard

Adapted dashboard layout, app-sidebar, nav-main and nav-user composition into
`app/_components/admin/admin-shell.tsx` and `admin-navigation.tsx`; adapted upstream
card, table and breadcrumb primitives into `app/_components/ui/`. Removed demo data,
account switchers, billing, notifications, preference stores and demo actions.
Existing ChatNest authorization, services and design tokens remain authoritative.
This listing does not imply Vercel-authored backend or RBAC.

MIT License

Copyright (c) 2024 Mohammed Arham Khan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## Vercel AI Elements — Artifact and Task

Source: https://github.com/vercel/ai-elements/tree/ca8be600bfd01b3131f9bf6134b51602a71f4374

Pinned commit: `ca8be600bfd01b3131f9bf6134b51602a71f4374`

Adapted `packages/elements/src/artifact.tsx` and `task.tsx` into
`app/_components/ai-elements/`. Local changes replace monorepo imports with the
existing ChatNest UI primitives, use a native button TaskTrigger, and leave Task
content layout to the existing activity timeline. Artifact and Task are composed
into the conversation workspace and real tool activity groups. No SDK, runtime,
or dependency changes. The complete pinned upstream copyright/license notice is
retained verbatim in `app/_components/ai-elements/AI_ELEMENTS_LICENSE`. The full
Apache License 2.0 text is included in `app/_components/ai-elements/APACHE-2.0.txt`.

### AI Elements Question

`app/_components/ai-elements/question.tsx` is adapted from Vercel AI Elements,
commit `ca8be600bfd01b3131f9bf6134b51602a71f4374` (`packages/elements/src/question.tsx`),
under the Apache-2.0 license reproduced above. Local import paths are adjusted;
`asField` composes multiple model-defined questions in one owning form without
nested HTML forms. Source: https://github.com/vercel/ai-elements/blob/ca8be600bfd01b3131f9bf6134b51602a71f4374/packages/elements/src/question.tsx

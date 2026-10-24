# Composition correction verification

Implementation: `132f713`. Previous implementation's visual acceptance was rejected by the user; it is not treated as approved merely because tests passed.

## Actual changes and visual checks

- Desktop1440×900: temporary history removal; conversation400px, artifact1040px; one52px title/action rail and immediately adjacent table header. Continuous white/card canvas and final column fills remaining width.
- Same-data comparison: `.local-review/composition-before.png` versus `composition-after-same-data.png` reuse the same original conversation/filter/records. `composition-final-1440.png` is a separate12-record synthetic-density test, not the same data as the baseline.
- 390px dirty table revealed a real clipped columns menu and crowded title. Reproduced, fixed with collision-aware Popovers and deliberate mobile two-row header; retested checkbox toggling, export and close. Evidence: `composition-mobile-before-fix.png`, `composition-mobile-fixed.png`.
- Explicit sidebar reopening works during focus; closing restores history. Keyboard resizing changes the divider. Text→code artifact switching works with one header and zero table controls; generic viewers and Agent runtime remain unchanged.

## Fresh end-to-end fixture

- New browser upload of PDF/DOCX/XLSX; all extraction ready. Agent tools read actual page/cell/paragraph references, then loadSkill and readSkillResource.
- HTTP MCP call count0 before browser approval and1 after approval. Twelve mock records yielded a real persisted native result table. The mocked model chooses this test sequence; this does not prove external-model planning quality or supplier availability.
- Filtering1688 produced8/12 and saved version2. Reopened note exact. CSV downloaded via actual UI had12 rows/five labelled columns. Clearing filter and saving final note produced version3; original rows/source equal version1. Final production preview reopened version3 and exact note; no captured production console errors.
- No commercial API/model calls, customer materials, migrations or altered approval policy.

## Code verification

- Root safe suite before mobile fix:280/280 plus TypeScript. Agent final safe suite:280/280 plus TypeScript/scoped Biome.
- Root primary main initial parallel run:279/280; existing MCP close timer assertion (<150ms) took240ms while builds/compilation were concurrent. Assertion and implementation were not relaxed. Serial rerun result recorded below.
- Final direct isolated production build passed;178 app/components/artifacts/hooks runtime files match preview, main and build snapshot. Production server stopped after verification, dev preview retained. No push.
- Independent final source/visual review found no blocking defect after clipping correction. Remaining differences from Lessie: generic fields, attachment/artifact cards, version footer; no fabricated people/match groups/contact actions.
- Root primary serial rerun passed280/280 and TypeScript (exit0). Logs: `.local-review/unified-composition-main-serial-units.log` and `...-types.log`. No assertion was changed to obtain this result.
- Browser overrides restored to normal1280×720 viewport; full-page actual native capture also saved as `composition-final-native.png`. Isolated fixture test identity remains in the retained preview; no real login/account changed.

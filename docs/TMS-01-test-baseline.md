# TMS-01 — visible-app test baseline

Implemented 9 October 2026 against `main` at `37f156d31eb89895f1503b0dbc2d65d0922240a2`.
Rebased for publication onto `bc93a5612a0615bf52a805d2e26a298b1b795a9b` after main advanced; visible
tests and typecheck were rerun before publishing.
This change updates tests, test configuration and documentation only. Production
source, permissions, database objects and financial calculations are unchanged.

## Changes

- Check all nine hidden navigation families for 15 primary-role cases on desktop
  and mobile, with an existing visible link as a positive control. Existing
  Upcoming Drivers direct-route permission tests remain in the suite.
- Supply current auth, assignment and delete-mutation mocks to Yard Repair tests.
  Exercise unit-first creation, inline editing for admin/manager/maintenance,
  retained audit fields, failed-save drafts and read-only controls.
- Repair the additional pre-trip selector test discovered on latest main. Use
  keyboard interaction and stub jsdom's missing `scrollIntoView`; retain the
  actual Radix component and verify that the selected form details change.
- Add repeatable full/visible commands. The visible configuration excludes only
  five exact named hidden-board failures, preserving candidate editing and route
  tests. The default full suite is unfiltered.

## Acceptance evidence

| Check | Result |
|---|---|
| Before: complete suite | 190 passed, 18 failed (208 tests) |
| `npm run test:visible` | 220 passed, 5 explicitly excluded (225 tests) |
| `npm test` | 220 passed, 5 known hidden-board failures (225 tests) |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; existing bundle-size/browser-externalization warnings |
| `npm run lint` | Existing baseline: 2,768 errors, 118 warnings; no new diagnostics |
| Lint on changed test/config files | No errors or warnings |
| `git diff --check` | Passed |

The build generates `supabase/functions/mcp/index.ts`; that unrelated generated
change was restored before committing and comparing the final lint baseline.

## Explicitly excluded failures

These five tests in `src/components/upcoming-drivers/board.test.tsx` fail because
the existing page test harness lacks a Router provider:

1. `Weekly board shows all seven days, an unscheduled group and Chicago arrival times`
2. `Weekly board navigates whole weeks and returns to This Week`
3. `Weekly board opens the full comment from its compact cell`
4. `Weekly board filters names and formatted phone numbers`
5. `Weekly board does not show editing actions to a read-only role`

The complete suite remains failing; this is not a fully green-suite claim.
Candidate editing tests in the same file still run in the visible suite. Do not
exclude new failures automatically; investigate them before accepting a step.
The frontend Vitest suite does not claim to cover Deno Edge Function tests.

## Benefit, release and rollback

The visible acceptance suite now gives a usable baseline for later changes.
No application performance improvement is claimed for this preparatory step.
Implementation/testing completion is separate from merging or deploying.

Rollback: revert the commit titled `TMS-01: repair visible-app test baseline`
with `git revert <commit SHA>`. No data or database rollback is needed.

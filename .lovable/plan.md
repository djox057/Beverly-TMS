# Weekend / afterhours assignment: how the split should work, and what to fix

## How drivers should be divided

1. **ELD people get nothing.** They are on duty but never cover trucks. Their own weekday drivers go back into the pool for others.
2. **Split by office.** Each person covers only the office they are marked for that day. If an admin marks a Čačak person as covering Kragujevac, that person gets Kragujevac's trucks.
3. **Inside one office, everybody gets a near-equal count.** Each person first keeps their own weekday drivers, then the rest of that office's drivers are handed out so totals land within a couple of drivers of each other.
4. **Same company where possible.** Within the equal-count target, a person gets drivers from one company rather than a mix.
5. **Offices with nobody on duty** have their drivers spread evenly across everyone on duty.

## What the numbers actually say now

The saved assignments for Saturday Sep 19 are already correct and even: 48, 47, 46, 44, 42, 38 (Čačak/Kragujevac), 50, 47, 45 (Beograd), ELD 0, plus one person with 2.

The screenshot shows 0 drivers for four of those same people. So the assignment itself is fine — the **Fleets page is not reading all of the saved rows**, and shows 0 for whoever falls past the cut-off.

## Confirmed causes

1. **Row cut-off when loading assignments.** The Fleets weekend data loads assignments for every scheduled date in the next 9 days (currently 4 dates × ~409 rows ≈ 1,640 rows) in one request. The database returns at most 1,000 rows per request, so roughly the last 600 rows are silently dropped — those people display 0 drivers. The active-driver and truck lists in the same load have the same missing safeguard and will break the page the same way as the fleet grows past 1,000.
2. **People with no office set get almost nothing.** One scheduled person has no office on their profile, so they form their own empty bucket and only receive drivers whose dispatcher also has no office — that is the "2 drivers" row.

## Fix plan

1. Load weekend assignments, active drivers and trucks in pages of 1,000 until everything is fetched, so no rows are dropped and the displayed counts always match what is saved.
2. Apply the same paging to the afterhours shift assignment loaders and the coverage lookup used by Reports and Individual Mode, which read the same tables the same unsafe way.
3. When a scheduled person has no office, put them in the shared pool instead of an empty bucket: they take an equal share of drivers from the offices that need extra coverage, so they no longer end up with almost none.
4. Re-run Auto Assign and verify against the database that every person's on-screen count equals their saved count, across all scheduled dates.

## Technical notes

- `src/hooks/useAfterhoursAssignments.ts`: the `Promise.all` block fetches `afterhours_assignments`, `drivers` and `trucks` with no `.range()`, hitting PostgREST's implicit 1,000-row limit. Wrap each in a paged fetch loop (pattern already used in `src/hooks/useDrivers.ts` / `useTrucks.ts`).
- Same treatment for `src/hooks/useAfterhoursShiftAssignments.ts`, `src/hooks/useAfterhoursDriverMap.ts` and `src/contexts/IndividualModeContext.tsx`.
- `src/lib/afterhoursAutoAssign.ts`: users whose canonical office key is `unknown` should be merged into the uncovered-driver spread instead of forming their own bucket; mirror in `supabase/functions/auto-assign-weekend-drivers/index.ts` and redeploy that function.
- No database schema change required.

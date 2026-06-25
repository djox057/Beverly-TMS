# Fix: Off-duty dispatcher drivers missing orders on first load

## Problem
In Reports, off-duty dispatcher groups (e.g. "Srdjan Belovukovic-Sam (Off Duty)" on BG 4th floor) show several drivers with empty cells initially. After switching to another office tab and back, those orders appear.

## Root cause
`fetchAllOfficeDriverScopes` in `src/hooks/useReportsDateWindow.ts` buckets each active driver into an office based on their **current** `drivers.dispatcher_id`'s office. Off-duty snapshot drivers (stored in `dispatcher_status.inactive_trucks`) are displayed under the **off-duty dispatcher's** office in the adapter, but their orders are only fetched when the office tab matching their **current** (replacement) dispatcher is visited. So an off-duty driver whose current dispatcher lives in a different office only loads orders after the user visits that other office (which seeds them into the module-level `globalAccumulatedOrders` store).

This matches the observed pattern: "only some" off-duty drivers are missing (the ones whose current dispatcher belongs to a different office), and visiting the office that has them and coming back fixes it.

## Fix
In `src/hooks/useReportsDateWindow.ts`:

1. Extend `fetchAllOfficeDriverScopes` to also query `dispatcher_status` (`is_active = false`) and the profiles for those off-duty dispatchers, and add each off-duty `inactive_trucks[].id` driver id into the bucket for the **off-duty dispatcher's** office (in addition to any bucket they're already in via their current dispatcher).
   - De-dupe driver ids per office (use a Set during accumulation, convert to array at the end).
   - Off-duty snapshot rows with no `office` on the dispatcher profile are skipped (same as today).
2. No changes needed to the date-window orders query — it already filters by `driver1_id`/`driver2_id` `IN (...)`, so including off-duty driver ids in the office bucket makes the office tab fetch their orders in the same single window pass.

## Why this works
- The adapter already filters off-duty groups by `priorityOffice` against the off-duty dispatcher's office, so the orders we fetch for them will be consumed by the group rendered in that same office tab.
- Drivers whose current dispatcher is in the same office as the off-duty dispatcher are unaffected (Set de-dup).
- No changes to the realtime store, spotlight logic, or adapter rendering.

## Files
- `src/hooks/useReportsDateWindow.ts` — add `dispatcher_status` + off-duty profile fetch inside `fetchAllOfficeDriverScopes`, merge off-duty driver ids into the per-office buckets.

## Verification
- Open Reports → BG 4th floor on a fresh session: off-duty group's drivers (e.g. Andrew Johnson, William Englehart) should show their stops immediately, matching what currently only appears after toggling to another office and back.
- Switch tabs: no regression in active dispatcher rows.
- Console: `[useReportsDateWindow] ✅ Pre-computed scopes` should report a slightly higher driver total once off-duty ids are merged.

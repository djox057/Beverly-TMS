

# Fix Drug-Test "New Driver" detection — use all-time load count

## The problem

In Reports, the green/red drug-test cell highlight and the click-to-set-result UI appear for any driver flagged "new". Today "new" is computed from `truck.allOrders`, which is **scoped to the currently viewed Reports date window**. A driver like Leonard Smith — who has many historical loads but only 1 inside the current window — incorrectly shows as a new driver and gets the drug-test treatment.

## Fix

Switch the drug-test "is new" check to use **all-time** load count: a driver is "new for drug-test purposes" only if they have **fewer than 2 non-canceled orders ever recorded** (i.e. no loads, or just their very first one).

The existing `isNewDriver` helper (window-based) keeps its current behavior so the "New Drivers" filter button continues to work as today (that filter button is intentionally about who's new in the visible window).

## Changes

### 1. New hook `src/hooks/useDriverAllTimeLoadCounts.ts`

Returns a `Map<driverId, number>` of total non-canceled orders per driver, plus a helper `getDriverLoadCount(driverId)`.

- Single Supabase query against `orders`, grouping by `driver1_id` (and accounting for `driver2_id` so team drivers count both ways), filtering out canceled rows.
- Uses TanStack Query, cached with key `["driver-all-time-load-counts"]`, `staleTime` 5 min.
- Lightweight: only `driver1_id, driver2_id` columns selected.

### 2. `src/pages/Reports.tsx`

- Import the new hook, call it once at the top of the component.
- Add `isNewDriverForDrugTest(truck)` inline helper (or memoized callback): returns `true` when `getDriverLoadCount(truck.driverId) < 2`.
- Replace the two `isNewDriver(truck)` calls that gate drug-test logic with `isNewDriverForDrugTest(truck)`:
  - Line ~400 inside `getDriverCellStyle` (controls green/red highlight)
  - Line ~4067 (`const isNew = …`) which feeds `shouldShowDrugTestUI`
- Update the corresponding `useCallback` dependency arrays.

### 3. Nothing else changes

- `useReportsFilters.ts` `isNewDriver` is kept as-is (still used elsewhere via the New Drivers filter, though that filter actually uses its own inline logic — leaving the helper untouched avoids breakage).
- No DB schema changes, no new RLS, no migrations.
- "New Drivers" filter button behavior is unchanged.
- Drug-test toast / mutation logic unchanged.

## Result

Leonard Smith (and anyone with 2+ historical loads) will no longer get the drug-test cell coloring or click-to-set dialog, regardless of the date window. Truly brand-new drivers (0 or 1 lifetime load) keep the existing behavior.

## Verification

1. View Reports for a date window where Leonard Smith has 1 load — cell should render normally, no green/red drug-test styling, no click-to-open drug-test dialog.
2. Create/find a driver with 0 lifetime loads — should still show drug-test UI.
3. A driver with exactly 1 lifetime load (their first ever) — should still show drug-test UI.
4. Driver with 2+ lifetime loads — never shows drug-test UI in Reports, regardless of window.
5. The "New Drivers" filter button at the top of Reports still filters correctly (window-based logic intact).


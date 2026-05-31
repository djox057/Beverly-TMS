## Goal

When an afterhours user has Individual Mode ON and their profile office is `BG 1st floor` or `BG 4th floor`, Reports should show a single combined **BG** office tab containing all of their assigned trucks from both floors — instead of two separate tabs with the "other floor" blocked by the cross-office Individual Mode restriction.

This change is scoped to the afterhours + individual-mode case only. All other roles, and afterhours users with Individual Mode OFF, keep the existing two separate BG tabs and current behavior.

## Where the problem is today

1. `src/pages/Reports.tsx` builds the office tab list from a fixed array:
   ```
   const offices = ["Čačak", "KRAGUJEVAC", "BG 1st floor", "BG 4th floor", "Recovery"];
   ```
   The active tab is sent to the data hook as `priorityOffice`, and groups are filtered with `group.office === activeTab`.
2. `src/hooks/useReportsDateWindowAdapter.ts` computes:
   ```
   isViewingOtherOffice = userOffice && priorityOffice && userOffice !== priorityOffice
   isViewingOtherOfficeInIndividualMode = individualMode && isViewingOtherOffice && !hasActiveSearch
   ```
   When true, it short-circuits data loading and shows the "other office" message. For a BG 1st floor afterhours user clicking BG 4th floor, this hides their trucks parked under BG 4th floor dispatchers.
3. `useReportsDateWindow` / adapter then also filter groups to `group.office === priorityOffice` server-side and in `groupedData`.

## Plan

### 1. Detect the combined-BG case (Reports.tsx)

- Read `individualMode` and `currentUserDispatcherId` from `useIndividualMode`.
- Read primary role via existing auth context (`getPrimaryRole() === 'afterhours'`).
- Compute `useCombinedBgTab = isAfterhours && individualMode && profile?.office in {'BG 1st floor', 'BG 4th floor'}`.

### 2. Replace the two BG tabs with one virtual `BG` tab

- When `useCombinedBgTab` is true, build the offices list as:
  `["Čačak", "KRAGUJEVAC", "BG", "Recovery"]` and display label `BG`.
- Update `getInitialTab()` so a user whose profile office is `BG 1st floor` or `BG 4th floor` defaults to the virtual `BG` tab in this mode.
- Update the three tab-button class checks (`office === activeTab`) — they just compare strings, so nothing else needed.

### 3. Map the virtual tab to both real offices

- Introduce a helper:
  ```
  const expandOffice = (tab: string): string[] =>
    tab === 'BG' && useCombinedBgTab ? ['BG 1st floor', 'BG 4th floor'] : [tab];
  ```
- In `companiesInOffice` and any other `group.office === activeTab` filter inside Reports.tsx, use `expandOffice(activeTab).includes(group.office)` instead.
- For `filterReportsByOffice(activeTab)`, pass through unchanged but make that helper accept the combined case the same way.

### 4. Pass the combined office through to the data hook

Two options; pick (a) for the smallest blast radius:

(a) Pass `priorityOffice: null` when the combined BG tab is active. Individual Mode scoping is already driver-id based via `individualOverrideDriverIds`, so the user only loads their own afterhours-assigned drivers; nulling `priorityOffice` simply stops the adapter from filtering those drivers down to a single floor. Then the local `expandOffice` filter in Reports.tsx keeps the UI scoped to the BG floors only (the user has no non-BG drivers anyway in this scenario, but the guard is cheap and safe).

(b) Extend `useReportsDateWindowAdapter` / `useReportsDateWindow` to accept `priorityOffices: string[]` and apply the filter as `.in('office', priorityOffices)`. Larger change, not needed for this fix.

Going with (a).

### 5. Fix the cross-office block for BG floors

In `useReportsDateWindowAdapter.ts`, treat both BG floors as the same office when computing `isViewingOtherOffice`:

```
const BG_FLOORS = new Set(['BG 1st floor', 'BG 4th floor']);
const sameBg = userOffice && priorityOffice && BG_FLOORS.has(userOffice) && BG_FLOORS.has(priorityOffice);
const isViewingOtherOffice = !!(userOffice && priorityOffice && userOffice !== priorityOffice && !sameBg);
```

This means a BG 1st floor afterhours user no longer hits the "other office" message when the combined tab passes either BG value (defensive — combined tab passes null, but this also makes the regular Individual Mode behavior consistent for any future caller).

### 6. Out of scope

- No DB / migration changes.
- No edits to `useAfterhoursAssignments` (already groups BG together for auto-assign — unchanged).
- Daily Report, Analytics, Admin Users, Fleets: not touched.
- Non-afterhours roles: unchanged.
- Afterhours users with Individual Mode OFF: unchanged (still see both BG tabs separately like other roles).

## Files to edit

- `src/pages/Reports.tsx` — combined BG tab list, initial tab, `expandOffice` filter, pass `priorityOffice: null` when virtual BG tab active.
- `src/hooks/useReportsDateWindowAdapter.ts` — treat BG floors as the same office in `isViewingOtherOffice`.

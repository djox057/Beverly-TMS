

## Fix: Reports Search Bars Causing Database CPU Spikes

### Root Cause

The `hasActiveSearch` flag in Reports.tsx is computed from **raw (non-debounced)** filter values. Every keystroke recalculates this flag, which flows into `useReportsDateWindowAdapter` as a prop. When in Individual Mode viewing another office, this flag toggles `shouldBypassIndividualMode` and `isViewingOtherOfficeInIndividualMode`, which changes query parameters on every keystroke -- potentially triggering expensive database refetches before the debounce settles.

Additionally, the `useAutoSwitchOffice` hook creates its **own separate debounced copies** of all three filter values (with a different delay: 600ms in individual mode vs 300ms). This means there are **two independent debounce pipelines** for the same filter values, doubling the potential for DB queries.

### Plan

**1. Debounce `hasActiveSearch` in Reports.tsx**

Change the `hasActiveSearch` computation to use the already-debounced filter values instead of raw values:

```typescript
// Before (fires on every keystroke):
const hasActiveSearch = !!(
  loadNumberFilter.trim().length >= 3 ||
  truckDriverFilter.trim().length >= 2 ||
  dispatchNameFilter.trim().length >= 2
);

// After (only fires after debounce settles):
const hasActiveSearch = !!(
  debouncedLoadNumberFilter.trim().length >= 3 ||
  debouncedTruckDriverFilter.trim().length >= 2 ||
  debouncedDispatchNameFilter.trim().length >= 2
);
```

**File:** `src/pages/Reports.tsx` (lines 363-367)

**2. Eliminate duplicate debouncing in `useAutoSwitchOffice`**

The hook currently receives raw filter values and creates its own debounced copies (lines 47-49). Instead, pass the already-debounced values from `useReportsFilters` and remove the internal `useDebounce` calls.

**File:** `src/hooks/useAutoSwitchOffice.ts`
- Remove the 3 internal `useDebounce` calls
- Rename params to indicate they're already debounced
- Update all references from `debouncedTruckDriver` / `debouncedDispatchName` / `debouncedLoadNumber` to use the passed-in values directly

**File:** `src/pages/Reports.tsx`
- Update the `useAutoSwitchOffice` call to pass debounced values:
```typescript
const { ambiguousMatch, searchStatus, foundOrderMeta } = useAutoSwitchOffice({
  truckDriverFilter: debouncedTruckDriverFilter,
  dispatchNameFilter: debouncedDispatchNameFilter,
  loadNumberFilter: debouncedLoadNumberFilter,
  activeTab,
  setActiveTab,
  offices,
  groupedReports,
});
```

### Technical Details

- The `useReportsFilters` hook already debounces all 3 filters at 300ms
- `useAutoSwitchOffice` was independently debouncing them again at 300ms (or 600ms in individual mode)
- This created a window where the first debounce fires, triggers state changes, then the second debounce fires 0-300ms later, triggering more state changes
- Each DB lookup in auto-switch does 2-4 chained queries (trucks -> drivers -> profiles), so duplicate triggers multiply the load significantly
- Using pre-debounced values eliminates one entire round of DB queries per keystroke sequence

### Files Modified
1. `src/pages/Reports.tsx` -- use debounced values for `hasActiveSearch` and pass debounced values to `useAutoSwitchOffice`
2. `src/hooks/useAutoSwitchOffice.ts` -- remove internal `useDebounce` calls, use values directly


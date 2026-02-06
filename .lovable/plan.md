

# Phase 3B: Fix CPU Spikes on Reports Page

## Root Cause (Confirmed via Code Audit)

The CPU spikes are caused by three compounding issues, confirmed by reading the actual source code:

1. **Duplicate Realtime Subscriptions**: `useReports.ts` (line 219) subscribes to 6 tables via `reports-consolidated` channel even when `disableFetch: true`. Meanwhile, `useReportsDateWindowAdapter.ts` has its own realtime subscriptions for `truck_notes` (line 753) and `lost_day_notes` (line 835). Every DB change fires on both channels.

2. **Loading ALL Drivers Organization-Wide**: `useReportsDateWindow.ts` line 631 calls `fetchDriverIdsForOffice(null, ...)` -- the `null` means it fetches all dispatchers across all offices, then loads all their drivers. The adapter then filters by `priorityOffice` in JS at line 1350. This means every supporting query (trucks, drivers, truck_notes, lost_day_notes) fetches data for the entire company.

3. **Unstable `useMemo` Dependencies**: The 450-line transformation at line 979 has 16 dependencies (lines 1388-1407). Several are problematic:
   - `windowOrderIds` (line 1404): Recreated by its own `useMemo` every time `dateWindowHook.orders` changes reference, even if the IDs are identical
   - `isSupportingDataReady` (line 1406): A boolean computed inline at line 975 (`!!(trucks && drivers && dispatchers && companies)`) -- this creates a new boolean evaluation every render, but since it's a primitive it's actually stable. However, it being in the dep array alongside truly unstable deps amplifies re-runs.
   - `lastLoadsData` (line 1405): Object reference from `useQuery` that changes when the query refetches
   - `orderFilesMap` (line 1400): A new `Map` object created every time `orderFiles` or `lastLoadsData?.files` changes

## Fix 1: Disable Legacy Realtime When `disableFetch: true`

**File: `src/hooks/useReports.ts`, line 219**

Add early return when `disableFetch` is true:

```text
useEffect(() => {
    // When disableFetch is true, the date-window adapter handles its own
    // realtime subscriptions. Don't create a duplicate channel.
    if (disableFetch) return;
    
    let timeoutId: NodeJS.Timeout;
    // ... rest of existing subscription code
}, [queryClient, disableFetch]);
```

This eliminates the duplicate `reports-consolidated` channel that fires invalidations for `["reports", "priority"]` -- a query key that doesn't even exist when date-window loading is active.

## Fix 2: Scope Driver Loading to Current Office

**File: `src/hooks/useReportsDateWindow.ts`**

Two changes:

### 2a. Pass `priorityOffice` instead of `null` (line 631)

```text
const { driverIds, dispatcherIds } = await fetchDriverIdsForOffice(
    priorityOffice,  // was: null
    individualMode ? currentUserDispatcherId : null
);
```

### 2b. Add `priorityOffice` to the stable query key (line 619)

```text
const stableQueryKey = useMemo(() => [
    'reports-date-window-stable',
    priorityOffice || 'all-offices',
    individualMode ? 'individual' : 'all',
    individualMode ? currentUserDispatcherId : 'all-dispatchers',
], [priorityOffice, individualMode, currentUserDispatcherId]);
```

This ensures each office tab has its own cache entry. When switching tabs, React Query fetches only that office's drivers instead of reusing the full company dataset.

**Edge case handling**: When `priorityOffice` is `null` (no office selected), the existing `fetchDriverIdsForOffice` function already handles this by loading all dispatchers -- so no fallback is needed.

## Fix 3: Stabilize `useMemo` Dependencies (Audited)

After auditing the dependency array (lines 1388-1407), the main instability sources are:

- `windowOrderIds`: New array reference on every orders change even if IDs are identical
- `lastLoadsData`: Object reference changes on refetch even if data is same
- `orderFilesMap`: New Map on every `orderFiles` reference change

**File: `src/hooks/useReportsDateWindowAdapter.ts`**

### 3a. Stabilize `windowOrderIds` with a string comparison

Replace the current `windowOrderIds` memo (line 503) with one that only updates when the actual ID set changes:

```text
const windowOrderIdsRef = useRef<string[]>([]);
const windowOrderIds = useMemo(() => {
    if (!dateWindowHook.orders || dateWindowHook.orders.length === 0) {
        if (windowOrderIdsRef.current.length === 0) return windowOrderIdsRef.current;
        windowOrderIdsRef.current = [];
        return windowOrderIdsRef.current;
    }
    const newIds = dateWindowHook.orders.map((o) => o.id);
    // Only create new reference if IDs actually changed
    const prev = windowOrderIdsRef.current;
    if (prev.length === newIds.length && prev.every((id, i) => id === newIds[i])) {
        return prev;
    }
    windowOrderIdsRef.current = newIds;
    return newIds;
}, [dateWindowHook.orders]);
```

### 3b. Remove `isSupportingDataReady` and `windowOrderIds` from the main useMemo dependency array

`isSupportingDataReady` is only used for early-return guards at the top of the useMemo. Since it's derived from `trucks`, `drivers`, `dispatchers`, and `companies` (which are already in the dependency array), it's redundant as a dependency.

`windowOrderIds` is not used inside the transformation body at all -- it's only used for the order_files fetch. Remove it from the dependency array.

Updated dependency array (line 1388):

```text
}, [
    dateWindowHook.orders,
    dateWindowHook.driverIds,
    dateWindowHook.isLoading,
    dateWindowHook.isFetching,
    trucks,
    trailers,
    drivers,
    dispatchers,
    companies,
    truckNotes,
    lostDayNotes,
    orderFilesMap,
    priorityOffice,
    dispatcherId,
    isOrderFilesLoading,
    lastLoadsData,
]);
```

(Removed: `windowOrderIds`, `isSupportingDataReady`)

## Files Changed

| File | Change |
|---|---|
| `src/hooks/useReports.ts` | Guard realtime `useEffect` with `if (disableFetch) return` |
| `src/hooks/useReportsDateWindow.ts` | Pass `priorityOffice` to `fetchDriverIdsForOffice`, add to query key |
| `src/hooks/useReportsDateWindowAdapter.ts` | Stabilize `windowOrderIds` ref, remove redundant deps from main useMemo |

## Expected Outcome

- Fix 1: Eliminates duplicate realtime channel (6 table subscriptions removed)
- Fix 2: Reduces dataset from 300+ drivers to 30-50 per office tab; all downstream queries (trucks, drivers, notes) shrink proportionally
- Fix 3: Prevents 2-3 unnecessary re-runs of the 450-line transformation per realtime event

Combined effect: CPU spikes should drop from 45-77% to under 15%.


## Phase A: Reports Page Performance — IMPLEMENTED

### Changes Made

1. **Global Driver Scope Pre-computation** (`src/hooks/useReportsDateWindow.ts`)
   - Replaced `fetchDriverIdsForOffice` with `fetchAllOfficeDriverScopes` (2 parallel queries instead of 3 sequential)
   - Added `fetchIndividualDriverScope` for Individual Mode (unchanged logic)
   - `stableQueryKey` is now office-independent: `['reports-date-window-stable', mode, dispatcher]`
   - Added `scopeForOffice` memo for synchronous office lookups from cached map

2. **staleTime Tuning** (`src/hooks/useReportsDateWindowAdapter.ts`)
   - adapter-trucks: 30s → 300s
   - adapter-trailers: 30s → 300s
   - adapter-drivers: 30s → 300s (refetchInterval 60s kept for HOS)
   - adapter-dispatchers: 60s → 300s
   - adapter-companies: 60s → 600s
   - adapter-truck-notes: 30s → 300s
   - adapter-lost-day-notes: 60s → 300s
   - adapter-order-files: 30s → 300s

3. **Office-Independent Query Keys with driverScopeHash** (`src/hooks/useReportsDateWindowAdapter.ts`)
   - Added djb2-based `driverScopeHash` memo (collision-resistant)
   - Removed `priorityOffice` from 5 query keys, replaced with `driverScopeHash`
   - `adapter-lost-day-notes` queryFn now reads from closure instead of queryKey[3]
   - Removed `driverIdsForLostNotes` memo (no longer needed)

4. **Realtime Cache Patch Key Updates** (`src/hooks/useReportsDateWindowAdapter.ts`)
   - Added `driverScopeHashRef` (initialized with current value, updated synchronously)
   - Updated truck_notes setQueryData key
   - Updated lost_day_notes exactQueryKey construction
   - Updated trucks/drivers invalidateQueries keys
   - Confirmed all prefix-match references are already safe

5. **Timing Instrumentation**
   - `console.time/timeEnd` around fetchAllOfficeDriverScopes, office-lookup memo
   - `console.time/timeEnd` around fetchOrders (unlocked + locked + gap-fill)
   - `console.time/timeEnd` around all adapter queryFns
   - `console.time/timeEnd` around transformedData useMemo

### Expected Impact

| Metric | Before | After Phase A |
|--------|--------|---------------|
| Initial load (cold) | ~5s | ~3.5s |
| Tab switch (warm cache) | ~2s | <0.2s |
| Tab switch (cold cache) | ~2s | ~1s |
| Background refetch frequency | Every 30-60s | Every 5-10 min |

### Next Steps

- Measure real console.time numbers
- Decide on Phase B (fingerprint hash for transform skipping)
- Decide on Phases C/D (component splitting, virtualization)

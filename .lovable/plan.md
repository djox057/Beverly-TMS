

## Fix: Realtime Flush Race Condition + Reports Cleanup

Three separable fixes applied in priority order.

### Fix 1: Re-schedule stranded events in `finally` (Correctness)

**4 hooks need the same addition** — after `isFlushing = false` in each `finally` block, check if pending sets have items and call `scheduleFlush()`:

1. **`src/hooks/useOrdersRealtime.ts`** (line 208): Add check for `pendingOrderIds` and `pendingDeletes`
2. **`src/hooks/useDriversRealtime.ts`** (line 125): Add check for `pendingDriverIds` and `pendingDeletes`
3. **`src/hooks/useTrucksRealtime.ts`** (line 119): Add check for `pendingTruckIds` and `pendingDeletes`
4. **`src/hooks/useReportsDateWindowAdapter.ts`** (line 1249): Add check for `pendingOrderIds` and `pendingDeletes`

**Adapter early-return fix** (lines 1174-1181): The error/empty branch currently does `isFlushing = false; return;` outside the `finally` block. Fix: remove the `isFlushing = false; return;` and wrap the remaining fetch logic (lines 1184-1238) inside `if (flatOrders && flatOrders.length > 0) { ... }`. The delete notification at line 1177 stays in the error/empty branch. Control then falls through to the existing `finally` block which handles `isFlushing = false` and the re-schedule check.

### Fix 2: Remove stale `["reports"]` invalidations (Maintenance)

Remove 4 no-op `invalidateQueries({ queryKey: ["reports"] })` in `src/pages/Reports.tsx`:
- Line 1159 (cancel), 1201 (revert fallback), 1236 (revert main), 1297 (lumper)

**Keep intact**: `deleteLostDayNote` mutation (lines 478-496) uses `setQueryData(["reports"], ...)` — `lost_day_notes` has no realtime subscription. Add comment: `// Keep: lost_day_notes has no realtime subscription, optimistic update is the only UI path`

### Fix 3: Optimistic cancel removal (UX polish)

In `src/pages/Reports.tsx` cancel handler (after line 1156), call `removeOrderFromGlobalStore(orderId)` to instantly remove the canceled order from the reports view. Import from the adapter. Idempotent with the subsequent realtime flush — second call finds no matching order.

Revert and lumper handlers do NOT get optimistic updates — revert restores multiple fields (realtime is the correct source), lumper goes through an edge function that doesn't return the full order shape.


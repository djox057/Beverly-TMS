

## Fix: Reports Page Realtime Updates Not Working

All changes are in `src/hooks/useReportsDateWindowAdapter.ts`.

### Fix 1: Truck notes cache key mismatch

The `adapter-truck-notes` query key has 3 elements: `["adapter-truck-notes", priorityOffice, modeKeySuffix]`. The realtime handler currently patches with only 2 elements, so `setQueryData` never matches.

**Change**: Update the truck_notes realtime `setQueryData` call to include `modeKeySuffixRef.current` as the third key element. Add a fallback `setQueriesData` with `exact: false` on `["adapter-truck-notes"]` for resilience.

### Fix 2: Add trucks and drivers realtime subscriptions

The adapter subscribes to orders, pickup_drops, order_transfers, truck_notes, lost_day_notes, and order_files -- but NOT trucks or drivers. The legacy useReports hook had these but they are disabled when the adapter is active.

**Change**: Add a new realtime channel (or extend the existing one) subscribing to `trucks` and `drivers` table changes. On change, debounce 1 second, then invalidate with office-scoped keys:
- `["adapter-trucks", priorityOfficeRef.current, modeKeySuffixRef.current]`
- `["adapter-drivers", priorityOfficeRef.current, modeKeySuffixRef.current]`

This uses refs (already kept current synchronously on line 854-855) to ensure the invalidation targets the correct cache entry for the active office/mode.

### Fix 3: Lost day notes primary key consistency

The lost_day_notes query key has 4 elements but the primary `setQueryData` uses only 3. Update to include the driver IDs ref as the 4th element, matching the full query key. The existing `setQueriesData` fallback with `exact: false` already works, so this is a consistency improvement.

### Technical Details

- `modeKeySuffixRef` is updated synchronously on render (line 855), not via useEffect, so it is always current when realtime callbacks fire
- `priorityOfficeRef` follows the same pattern (line 854)
- The 1-second debounce for trucks/drivers invalidation prevents query storms on bulk updates
- No cache patching needed for trucks/drivers -- simple invalidation is sufficient since these are small datasets


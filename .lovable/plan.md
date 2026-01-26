
# Fix: Order Files Not Displaying in Reports (RC/BOL/POD Missing)

## Problem Summary

When document files (RC, BOL, POD) are uploaded, they correctly appear in the Orders page but NOT in the Reports page. This affects **253+ orders** with files in the current date window.

**Example:** Load S113550459 has an RC file uploaded on Jan 23 and a BOL file uploaded 30 minutes ago at 21:24, but the Reports page shows no document indicators.

---

## Root Cause

The Reports page uses a separate data architecture from the Orders page:

```text
Orders Page:                          Reports Page:
┌─────────────────────┐               ┌─────────────────────────────┐
│ useOrders           │               │ useReportsDateWindowAdapter │
│ Query: ["orders"]   │               │ Query: ["adapter-order-files"]
│ Real-time: YES      │◄──────────────│ Real-time: NO               │
└─────────────────────┘               └─────────────────────────────┘
        ▲                                        ▲
        │                                        │
┌───────┴────────────────────────────────────────┴───────┐
│                  order_files table                      │
│                 (Supabase Realtime)                     │
└────────────────────────────────────────────────────────┘
```

**The Issue:**
1. `useOrdersRealtime.ts` listens to `order_files` changes
2. It updates ALL caches with keys starting with `["orders"]`
3. BUT it does NOT update `["adapter-order-files"]` used by Reports
4. The adapter's staleTime is 30 seconds, but the query key hash doesn't change when files are added
5. Result: Reports shows stale file data until page refresh

---

## Solution

Extend `useOrdersRealtime.ts` to also invalidate the Reports adapter's order_files cache when files are uploaded.

### Technical Changes

**File: `src/hooks/useOrdersRealtime.ts`**

Update `handleRelatedTableChange` function to additionally invalidate the adapter order_files cache:

```typescript
const handleRelatedTableChange = async (
  payload: RealtimePostgresChangesPayload<{ [key: string]: any }>
) => {
  const newRecord = payload.new as any;
  const oldRecord = payload.old as any;
  const orderId = newRecord?.order_id || oldRecord?.order_id;
  const tableName = (payload as any).table || '';

  if (!orderId) return;

  console.log(`[Realtime] Related table change for order:`, orderId, `table:`, tableName);

  // For order_files changes, also invalidate the adapter cache
  if (tableName === 'order_files') {
    // Invalidate all adapter-order-files queries so Reports refreshes
    queryClient.invalidateQueries({ 
      queryKey: ["adapter-order-files"],
      refetchType: 'active'  // Only refetch currently mounted queries
    });
  }

  // Continue with existing order cache update logic
  const fullOrder = await fetchSingleOrder(orderId);
  if (!fullOrder) return;

  const transformedOrder = transformOrder(fullOrder);
  updateAllOrdersCaches(orderId, transformedOrder);
};
```

---

## Why This Fix Works

| Event | Before Fix | After Fix |
|-------|-----------|-----------|
| User uploads BOL | Orders page updates via setQueryData | Same |
| | Reports page shows stale data | Reports invalidates + refetches |
| | Requires page refresh | Real-time update |

---

## Alternative Considered

**Option B: Share order_files data between Orders and Reports**
- Would require significant refactoring of the adapter architecture
- Risk of breaking existing functionality
- More complex to implement and maintain

**Chosen: Option A (Invalidation)** - Minimal code change, targeted fix, maintains existing architecture.

---

## Files to Modify

1. **src/hooks/useOrdersRealtime.ts**
   - Add table name detection in `handleRelatedTableChange`
   - Add cache invalidation for `["adapter-order-files"]` when `order_files` table changes

---

## Testing Checklist

1. Open Reports page for an office
2. In another tab, upload a BOL file for an order visible in Reports
3. Switch back to Reports - document indicator should update within seconds
4. Verify RC, BOL, POD indicators all update correctly
5. Verify existing Orders page real-time updates still work
6. Verify no performance degradation (uses refetchType: 'active')

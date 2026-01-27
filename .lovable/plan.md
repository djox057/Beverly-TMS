
# Paid Status for Archived Loads - Always Fresh from Database

## Problem

When archived (locked) orders are displayed on `/orders` and `/trips` pages, the `paid` status is read from the IndexedDB cache. However, the `paid` column can be updated even when orders are locked (per existing permission logic). This creates a data conflict:

- **Archive cache**: Contains stale `paid` value from when the order was archived
- **Live database**: Contains the current, authoritative `paid` value

**User impact**: A load may show as "unpaid" in the UI when it has already been marked "paid" in the database (or vice versa).

## Solution Overview

Fetch the **live `paid` status** from the database for all locked orders and merge it with archived data, ensuring the database value always wins. This is a minimal, targeted query that only fetches 2 columns (`id` and `paid`) for locked orders.

## Technical Design

### Lightweight Paid Status Fetch

Create a dedicated fetch that runs alongside the archive loading:

```sql
SELECT id, paid FROM orders WHERE locked = true
```

This query is:
- **Fast**: Only 2 columns (id + paid boolean)
- **Low bandwidth**: ~50 bytes per order (~500KB for 10,000 locked orders)
- **Parallel**: Runs alongside existing data fetching

### Merge Strategy

When transforming locked orders for display:
1. Fetch live `paid` status for all locked order IDs
2. Create a Map: `orderId -> paidStatus`
3. During transformation, **override** the cached `paid` value with the database value

**Conflict resolution**: Database `paid` value **always wins**.

### Pages Affected

| Page | Impact |
|------|--------|
| `/orders` | Paid column in table, "pending-payment" and "billed" filters |
| `/trips` | Paid checkbox per load, week-level paid status |
| `/reports` | Not affected - uses different data flow |
| `/analytics` | Not affected - uses different data flow |

## Implementation Details

### 1. Modify `enrichLockedOrdersWithLookups` in `src/hooks/useOrders.ts`

Add a parallel fetch for live paid status and merge it into the enriched orders:

```typescript
// Fetch live paid status from database for all locked orders
const fetchLivePaidStatus = async (orderIds: string[]): Promise<Map<string, boolean>> => {
  if (orderIds.length === 0) return new Map();
  
  const paidMap = new Map<string, boolean>();
  const batchSize = 1000;
  
  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize);
    const { data } = await supabase
      .from("orders")
      .select("id, paid")
      .in("id", batch);
    
    (data || []).forEach((row: any) => {
      paidMap.set(row.id, row.paid === true);
    });
  }
  
  return paidMap;
};
```

### 2. Integration in `enrichLockedOrdersWithLookups`

Add the paid status fetch to the parallel fetch block and merge during enrichment:

```typescript
// In the Promise.all block, add:
const livePaidStatusPromise = fetchLivePaidStatus(orderIds);

// After all fetches complete:
const livePaidStatus = await livePaidStatusPromise;

// In the enrichment loop:
const enriched = lockedOrders.map((order) => ({
  ...order,
  // ... existing enrichment
  // Override paid with live database value (always wins)
  paid: livePaidStatus.has(order.id) ? livePaidStatus.get(order.id) : order.paid,
}));
```

### 3. Handle Real-time Updates

When the `paid` status is toggled on `/orders` or `/trips`:
- The mutation already updates the database
- The real-time subscription already invalidates the cache
- No additional changes needed for real-time sync

## Performance Analysis

| Metric | Value |
|--------|-------|
| Query complexity | O(1) - simple indexed select |
| Data transferred | ~50 bytes × N orders |
| Additional queries | 1 per batch (1000 orders each) |
| Latency impact | Minimal - runs in parallel |

For 10,000 locked orders:
- ~10 batched queries (1000 each)
- ~500KB total data
- Runs in parallel with existing lookups

## Files to Modify

1. **`src/hooks/useOrders.ts`**
   - Add `fetchLivePaidStatus` helper function
   - Integrate into `enrichLockedOrdersWithLookups` function
   - Ensure paid status is fetched in parallel with other enrichments
   - Override `paid` property during enrichment

## Edge Cases

1. **Order becomes unlocked**: Unlocked orders already fetch fresh data from DB - no issue
2. **Order locked after page load**: Real-time subscription handles updates
3. **Paid status toggled while viewing**: React Query cache update via `setQueryData` handles this
4. **Network failure on paid fetch**: Falls back to cached value (graceful degradation)

## Testing Scenarios

1. Lock an order with `paid = false`
2. Using SQL, update `paid = true` for that order
3. Refresh `/orders` page
4. Verify the order shows as "paid" (checked checkbox)
5. Repeat test on `/trips` page

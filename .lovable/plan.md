# Reports Page Performance Optimization Plan (CORRECTED)

## Problem Summary

The `/reports` page is experiencing severe performance issues:
1. **Database Statement Timeouts**: Multiple `"canceling statement due to statement timeout"` errors
2. **Massive Data Over-fetch**: A 5-day window returns **3,711 orders** instead of ~50-150
3. **Broken Query Filter Logic**: Multiple `.or()` calls create ambiguous boolean grouping
4. **All Offices Fetched Simultaneously**: Overwhelming the database

## Root Cause: Broken Filter Logic

Current query uses TWO separate `.or()` calls:
```typescript
.or(`driver1_id.in.(...),driver2_id.in.(...)`)
.or(`pickup_datetime.gte.${start},pickup_datetime.lte.${end},...`)
```

**Problem**: PostgREST interprets this as:
- `(driver1 OR driver2) AND (pickup >= start OR pickup <= end OR delivery >= start OR delivery <= end)`

The date filter is **logically broken** - it returns almost all orders.

## Corrected Filter Logic (CRITICAL)

Target boolean structure:
```
locked = false
AND (driver1_id IN scope OR driver2_id IN scope)
AND ((pickup_datetime BETWEEN start AND end) OR (delivery_datetime BETWEEN start AND end))
```

### PostgREST Nested Filter Syntax

Use proper nesting with `and()` inside `or()`:
```typescript
.eq("locked", false)
.eq("canceled", false)
.or(`driver1_id.in.(${ids}),driver2_id.in.(${ids})`)
.or(`and(pickup_datetime.gte.${start},pickup_datetime.lte.${end}),and(delivery_datetime.gte.${start},delivery_datetime.lte.${end})`)
```

**If this still causes ambiguity**: Implement an RPC function for unambiguous WHERE clause.

## Implementation Changes

### 1. Fix `fetchOrdersForDateWindow` Query (src/hooks/useReportsDateWindow.ts)

```typescript
const fetchOrdersForDateWindow = async (
  driverIds: string[],
  dateWindow: DateWindow,
): Promise<any[]> => {
  if (driverIds.length === 0) return [];

  const startDateStr = formatDateForQuery(dateWindow.startDate);
  const endDateStr = formatDateForQuery(dateWindow.endDate);
  const driverIdsStr = driverIds.join(',');

  // Flat select first (no joins - faster, index-friendly)
  const BATCH_SIZE = 1000;
  let allOrders: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: batch, error } = await supabase
      .from("orders")
      .select(`id, load_number, internal_load_number, ...`) // Flat columns only
      .eq("locked", false)              // Filter 1: unlocked only
      .eq("canceled", false)            // Filter 2: not canceled
      .or(`driver1_id.in.(${driverIdsStr}),driver2_id.in.(${driverIdsStr})`)
      .or(`and(pickup_datetime.gte.${startDateStr},pickup_datetime.lte.${endDateStr}T23:59:59),and(delivery_datetime.gte.${startDateStr},delivery_datetime.lte.${endDateStr}T23:59:59)`)
      .order("pickup_datetime", { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;
    if (batch) allOrders = allOrders.concat(batch);
    hasMore = batch?.length === BATCH_SIZE;
    offset += BATCH_SIZE;
  }

  // Step 2: Fetch pickup_drops and order_transfers in parallel
  const orderIds = allOrders.map(o => o.id);
  if (orderIds.length === 0) return [];

  const [pickupDrops, transfers] = await Promise.all([
    fetchPickupDropsForOrders(orderIds),
    fetchOrderTransfersForOrders(orderIds)
  ]);

  // Build lookup maps
  const pickupDropsByOrderId = new Map<string, any[]>();
  for (const pd of pickupDrops) {
    const arr = pickupDropsByOrderId.get(pd.order_id) || [];
    arr.push(pd);
    pickupDropsByOrderId.set(pd.order_id, arr);
  }

  const transfersByOrderId = new Map<string, any[]>();
  for (const t of transfers) {
    const arr = transfersByOrderId.get(t.order_id) || [];
    arr.push(t);
    transfersByOrderId.set(t.order_id, arr);
  }

  // Attach with sequence_number sorting for deterministic stop order
  return allOrders.map(order => ({
    ...order,
    pickup_drops: (pickupDropsByOrderId.get(order.id) || [])
      .sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0)),
    order_transfers: (transfersByOrderId.get(order.id) || [])
      .sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0))
  }));
};
```

### 2. Add Helper Functions for Parallel Batched Fetching

```typescript
const fetchPickupDropsForOrders = async (orderIds: string[]): Promise<any[]> => {
  if (orderIds.length === 0) return [];
  const allDrops: any[] = [];
  const BATCH_SIZE = 300;

  for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
    const batch = orderIds.slice(i, i + BATCH_SIZE);
    const { data } = await supabase
      .from("pickup_drops")
      .select("id, order_id, type, address, city, state, zip_code, datetime, end_datetime, sequence_number, arrived_at, checked_out_at, going_to_at")
      .in("order_id", batch);
    if (data) allDrops.push(...data);
  }
  return allDrops;
};

const fetchOrderTransfersForOrders = async (orderIds: string[]): Promise<any[]> => {
  if (orderIds.length === 0) return [];
  const allTransfers: any[] = [];
  const BATCH_SIZE = 300;

  for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
    const batch = orderIds.slice(i, i + BATCH_SIZE);
    const { data } = await supabase
      .from("order_transfers")
      .select("id, order_id, sequence_number, driver1_id, driver2_id, truck_id, trailer_id, miles, driver_price, transfer_city, transfer_state, transfer_address, transfer_datetime")
      .in("order_id", batch);
    if (data) allTransfers.push(...data);
  }
  return allTransfers;
};
```

### 3. Fix Gap-Fill Query with SAME Filter Grouping

```typescript
const fetchGapFillOrders = async (...) => {
  const { data, error } = await supabase
    .from("orders")
    .select(`...`) // Flat select
    .eq("locked", true)
    .eq("canceled", false)  // ADDED: exclude canceled
    .or(`driver1_id.in.(${driverIdsStr}),driver2_id.in.(${driverIdsStr})`)
    // FIXED: Same nested date filter
    .or(`and(pickup_datetime.gte.${start},pickup_datetime.lte.${end}T23:59:59),and(delivery_datetime.gte.${start},delivery_datetime.lte.${end}T23:59:59)`)
    .limit(500);
  
  // Then fetch pickup_drops/transfers separately and attach
};
```

### 4. Active Office Tab Only

In the adapter/hook, ensure:
```typescript
useQuery({
  queryKey: ['reports-date-window', priorityOffice, windowKey],
  enabled: !!dispatcherId && activeTab === priorityOffice, // Only fetch for active tab
  ...
});
```

### 5. Canceled Filter Default

- Default `canceled = false` in ALL queries (main, gap-fill, archive)
- Canceled orders only shown per existing "pickup today + no replacement" rule
- No toggle currently exists, so canceled=false is enforced

### 6. Indexing Strategy (Proposal - Requires EXPLAIN ANALYZE)

DO NOT add one large composite index. Instead, propose targeted partial indexes:

```sql
-- Partial index for unlocked, non-canceled orders by driver1 + pickup date
CREATE INDEX CONCURRENTLY idx_orders_reports_driver1_pickup
ON orders (driver1_id, pickup_datetime)
WHERE locked = false AND canceled = false;

-- Partial index for unlocked, non-canceled orders by driver2 + pickup date
CREATE INDEX CONCURRENTLY idx_orders_reports_driver2_pickup
ON orders (driver2_id, pickup_datetime)
WHERE locked = false AND canceled = false;

-- Similar for delivery if needed
CREATE INDEX CONCURRENTLY idx_orders_reports_driver1_delivery
ON orders (driver1_id, delivery_datetime)
WHERE locked = false AND canceled = false;

CREATE INDEX CONCURRENTLY idx_orders_reports_driver2_delivery
ON orders (driver2_id, delivery_datetime)
WHERE locked = false AND canceled = false;
```

**Before applying**: Run EXPLAIN ANALYZE on the corrected query to measure impact.

## Acceptance Criteria

| Criteria | Target |
|----------|--------|
| Orders in 5-day window | Tens to low hundreds (not thousands) |
| Statement timeouts | None |
| Initial load time | 1-3 seconds |
| Office tab loading | Only active tab fetches |
| Canceled loads | Hidden by default |
| Stop ordering | Deterministic (by sequence_number) |
| Output shape | Identical (orders[].pickup_drops[], orders[].order_transfers[]) |

## Files to Modify

1. **`src/hooks/useReportsDateWindow.ts`**
   - Fix filter logic with proper nested boolean grouping
   - Add `eq("locked", false)` and `eq("canceled", false)`
   - Remove joins from main query, fetch pickup_drops/transfers separately
   - Sort pickup_drops by sequence_number when attaching
   - Fix gap-fill query with same corrected filters

2. **`src/hooks/useReportsDateWindowAdapter.ts`**
   - Ensure `enabled: activeTab === priorityOffice` pattern

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| PostgREST filter ambiguity | Test with EXPLAIN ANALYZE; fallback to RPC if needed |
| Data shape changes | Keep identical output structure |
| Stop order instability | Sort by sequence_number |
| Missing transfers | Separate fetch includes all transfers for matched orders |

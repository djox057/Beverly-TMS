

# Fix: Next-Order Lookup Failing Due to Supabase 1000-Row Limit

## Root Cause

The query at line 297-303 fetches ALL non-canceled orders for each driver (up to 200 drivers per batch), ordered by `pickup_datetime ASC`. Supabase returns at most 1000 rows per query. With ~72 orders per driver, a single chunk of 200 drivers would need ~14,400 rows -- but only the oldest 1000 come back. The heatmap orders (recent dates) are never in this truncated result, so the index lookup always fails and no "next order" is found.

## Fix

Constrain the driver-orders query by date. We know the heatmap orders' pickup dates, so we only need orders from slightly before the earliest heatmap pickup to slightly after the latest one (to find the "next" order). This dramatically reduces the result set.

### Changes in `src/pages/BeverlyHeatmap.tsx`

**1. Compute a date window from the heatmap orders (after Step 1, around line 257)**

After fetching `heatmapOrders`, find the min and max `pickup_datetime`. Set the query window from `minDate` to `maxDate + 30 days` (30 days gives enough room to find a next order even if the driver was idle for a while).

**2. Add date filters to the driver-orders query (lines 297-303)**

Add `.gte("pickup_datetime", minDate)` and `.lte("pickup_datetime", maxDatePlus30)` to the query. This ensures we only fetch a narrow band of orders per driver, keeping results well under 1000 rows per chunk.

**3. Add pagination as a safety net**

Use a `.range()` pagination loop (as done in `useLumperMissingRevisedRC`) so that even if a chunk somehow exceeds 1000 rows, all data is fetched. Each page fetches 1000 rows; loop until fewer than 1000 are returned.

## Technical Detail

```text
Before (line 297-303):
  supabase.from("orders")
    .select(columns)
    .in("driver1_id", chunk)
    .eq("canceled", false)
    .order("pickup_datetime", { ascending: true })
    // No date filter --> returns oldest 1000 rows only

After:
  supabase.from("orders")
    .select(columns)
    .in("driver1_id", chunk)
    .eq("canceled", false)
    .gte("pickup_datetime", minPickup)      // NEW
    .lte("pickup_datetime", maxPickupPlus30) // NEW
    .order("pickup_datetime", { ascending: true })
    .range(offset, offset + 999)            // NEW: pagination loop
```

The date window calculation:
- `minPickup` = earliest `pickup_datetime` from heatmap orders
- `maxPickupPlus30` = latest `pickup_datetime` + 30 days

This keeps each chunk to roughly `(drivers_in_chunk * orders_in_30_day_window)` rows, which for 200 drivers with ~2-3 orders per month each is ~400-600 rows -- well within limits.

## Summary

| What | Where |
|---|---|
| Compute min/max pickup date window | After line 257, new code |
| Add `.gte()` and `.lte()` date filters | Lines 297-303 |
| Add `.range()` pagination loop | Lines 297-303 |

This is a surgical fix -- only the driver-orders fetch query changes. No other logic is affected.


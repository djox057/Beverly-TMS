

# Precomputed Analytics Aggregates for Locked Orders

## Overview
Precompute 4 metrics (Total Freight, Total Driver Pay, Total Miles, Total DH Miles + order count) for locked orders, keyed by dispatcher and driver, per date. The Analytics page will merge small live unlocked orders with precomputed locked aggregates instead of fetching thousands of raw locked records.

## Database

### New table: `analytics_locked_daily`

```text
analytics_locked_daily
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  entity_type     TEXT NOT NULL          -- 'dispatcher' or 'driver'
  entity_id       TEXT NOT NULL          -- booked_by (dispatcher) or driver1_id UUID (driver)
  entity_name     TEXT                   -- resolved display name (refreshed on rebuild)
  date            DATE NOT NULL
  date_type       TEXT NOT NULL          -- 'pickup' or 'delivery'
  total_freight   NUMERIC DEFAULT 0      -- freight NO lumper (matches totalFreightAmountNoLumper)
  total_driver_pay NUMERIC DEFAULT 0     -- full driver pay formula
  total_miles     NUMERIC DEFAULT 0      -- loaded_miles + dh_miles + additional_miles
  total_dh_miles  NUMERIC DEFAULT 0      -- dh_miles only (for avg DH calculation)
  order_count     INT DEFAULT 0
  is_company_driver BOOLEAN DEFAULT false
  updated_at      TIMESTAMPTZ DEFAULT now()

  UNIQUE (entity_type, entity_id, date, date_type)
```

Indexes:
- `(entity_type, date_type, date)` -- for the range queries the frontend runs
- The UNIQUE constraint covers upsert lookups

RLS disabled -- accessed only via service role key from edge functions.

### Name staleness (review point #5)
`entity_name` is refreshed on every nightly rebuild. Acceptable for a 24-hour window. No additional mechanism needed.

## Edge Function: `recompute-analytics-aggregates`

### Core SQL aggregation
A single SQL query per entity_type/date_type combination (4 queries total: dispatcher x pickup, dispatcher x delivery, driver x pickup, driver x delivery). The SQL replicates the exact formulas from `ordersTransform.ts` lines 33-77:

**Total Freight (no lumper):**
```sql
COALESCE(freight_amount,0) + COALESCE(detention,0) + COALESCE(layover,0)
+ COALESCE(tonu,0) + COALESCE(extra_stop,0) + COALESCE(escort_fee,0)
+ COALESCE(other_additionals,0)
- COALESCE(late_fee,0) - COALESCE(no_tracking_fee,0)
- COALESCE(wrong_address_fee,0) - COALESCE(other_charges,0)
```

**Total Driver Pay:**
```sql
COALESCE(driver_price,0) + COALESCE(detention_driver,0) + COALESCE(layover_driver,0)
+ COALESCE(tonu_driver,0) + COALESCE(extra_stop_driver,0) + COALESCE(lumper_driver,0)
- COALESCE(late_fee_driver,0) - COALESCE(no_tracking_fee_driver,0)
- COALESCE(wrong_address_fee_driver,0) + COALESCE(other_charges_driver,0)
+ COALESCE(other_additionals_driver,0)
```

**Total Miles:** `COALESCE(loaded_miles,0) + COALESCE(dh_miles,0) + COALESCE(additional_miles,0)`

**Total DH Miles:** `COALESCE(dh_miles,0)`

**WHERE clause:** `locked = true AND (canceled = false OR COALESCE(tonu,0) > 0 OR COALESCE(tonu_driver,0) > 0)` -- matches the TONU exception in `filteredOrders` (line 1081).

### Zero-downtime rebuild (review point #2)
Instead of truncate-and-rebuild:
1. Write all rows to `analytics_locked_daily_staging` (same schema, created as a temp-like permanent table)
2. In a single transaction: `ALTER TABLE analytics_locked_daily RENAME TO analytics_locked_daily_old; ALTER TABLE analytics_locked_daily_staging RENAME TO analytics_locked_daily;`
3. Drop `analytics_locked_daily_old`

This ensures zero window where the table is empty.

### Staging table
Created alongside the main table in the migration. Same schema, same indexes. The edge function truncates staging, populates it, then swaps.

### Company driver flag (review point #1)
For driver entity_type rows, join to `drivers.is_company_driver` and store in the `is_company_driver` column. The frontend uses this to apply the "driver pay = freight" override for company drivers in commission calculations.

### Dispatcher entity_id
Uses `booked_by` column value (which is either a full_name or user_id string). This matches how `dispatcherAnalytics` groups orders on line 1307.

### Driver entity_id
Uses `driver1_id` UUID cast to TEXT. `entity_name` resolved via `LEFT JOIN drivers ON id = driver1_id`, with fallback to `deleted_driver1_name` for archived orders.

### Triggering (review point #4)
- **Nightly cron job** at 3 AM UTC via pg_cron calling the edge function
- **Manual recompute button** in Analytics page (admin-only) that invokes the same edge function
- **No Postgres trigger** -- the nightly cron handles the rare locked order edits. Documented in UI: "Locked order aggregates refresh nightly. Use the Recompute button for immediate updates."

## Validation Tool (review point #1)

### Edge function: `validate-analytics-aggregates`
Accepts a date range. For that range:
1. Fetches raw locked orders and computes totals client-side (same formula)
2. Fetches precomputed aggregates and sums them
3. Compares per-dispatcher and per-driver totals
4. Returns a diff report: any entity where freight/pay/miles differ by more than $0.01

This is a permanent admin tool, not a one-time check. Accessible via an admin button in Analytics or direct edge function call.

## Frontend Changes

### New hook: `useAnalyticsAggregates`
- Queries `analytics_locked_daily` via Supabase client for a given date range, entity_type, and date_type
- Returns `Record<string, { totalFreight, totalDriverPay, totalMiles, totalDhMiles, orderCount, isCompanyDriver }>`
- Small result set (typically under 500 rows for any date range), single fast query

### Modified: `useOrdersWithProgress`
- **Unlocked orders**: Still fetched live via `get-all-unlocked-orders` edge function (typically 200-500 orders)
- **Locked orders**: No longer fetched. The hook returns only unlocked orders.
- Progress tracking simplified: no more locked batch pagination
- The `["orders", "analytics-full"]` cache now holds only unlocked orders
- A new flag `usePrecomputed: true` signals to Analytics that aggregates come from the precomputed table

### Modified: `Analytics.tsx`

**Dispatcher Performance (line 1306):**
```text
Current: filteredOrders.reduce(...) over ALL orders
New:
1. filteredOrders (now only unlocked) .reduce(...) -> unlocked totals per dispatcher
2. useAnalyticsAggregates('dispatcher', dateType, dateRange) -> locked totals per dispatcher
3. Merge: for each dispatcher key, sum unlocked + locked totals
```

The `dateType` is determined by the existing `filterType`: month = 'delivery', week/custom = 'pickup' (matching line 1090).

**Driver Analytics (line 1750):**
Same merge pattern: unlocked driver totals + precomputed locked driver totals.

**Driver Gross Rankings (line 1959):**
This section groups ALL orders by driver and week (Tuesday-Monday, `weekStartsOn: 2`).
- For locked data: query `analytics_locked_daily` WHERE entity_type = 'driver' AND date_type = 'delivery' (rankings use delivery date, line 2013)
- Sum daily aggregates into Tuesday-Monday weekly buckets client-side
- The first/last week trimming logic (line 2047) operates on week keys, which works the same whether data comes from raw orders or daily sums
- **Week boundary alignment (review point #3):** The precomputed table stores per-date rows. Client-side code uses `startOfWeek(date, { weekStartsOn: 2 })` to bucket them into Tuesday-Monday weeks -- exactly matching the current logic. No ambiguity since we store daily granularity, not weekly.

**Driver All-Time Gross Tiers (line 1719):**
This needs ALL orders (no date filter) for total gross and first pickup date. Options:
- Keep fetching all unlocked orders (small set) for live data
- Query precomputed locked aggregates with no date filter (SUM total_freight, MIN date) grouped by driver
- Merge the two for all-time totals and first pickup date

**Totals row (line 1465):**
Same merge: sum unlocked order totals + sum locked aggregates for the filtered date range.

### Admin Recompute Button
Added to Analytics page header, visible only to admin role. Calls `recompute-analytics-aggregates` edge function and shows a toast on completion.

### Admin Validation Button
Next to recompute button. Calls `validate-analytics-aggregates` with current date range. Shows a dialog with any mismatches found.

## Fallback (existing path preserved)
The old `useOrdersWithProgress` full-fetch path is kept behind a feature flag (localStorage `analytics_use_raw_orders`). If set to `"true"`, Analytics falls back to fetching all raw orders. This allows instant rollback if formula mismatches are discovered.

## Implementation Order

1. Migration: create `analytics_locked_daily` + `analytics_locked_daily_staging` tables with indexes
2. Edge function: `recompute-analytics-aggregates` with swap-table logic
3. Edge function: `validate-analytics-aggregates` for permanent validation
4. Run initial population + validate against current client-side totals
5. Set up nightly cron job
6. New hook: `useAnalyticsAggregates`
7. Update `useOrdersWithProgress` to skip locked order fetching
8. Update `Analytics.tsx` to merge unlocked (live) + locked (precomputed)
9. Add admin Recompute + Validate buttons
10. Keep fallback flag for rollback

## Performance Impact

- **Before:** 10,000+ locked orders fetched in 5+ batches (5-15 seconds), each transformed and aggregated client-side
- **After:** ~500 aggregate rows fetched in a single query (under 200ms) + ~300 unlocked orders fetched live (under 1 second)
- **Net:** Analytics page loads 5-10x faster, dramatically lower CPU on both server and client


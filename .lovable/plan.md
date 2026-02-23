

# Frontend Integration: Precomputed Analytics Aggregates

## Summary
Wire up the validated backend (31,949 rows, 0 mismatches) to the Analytics frontend. This covers: schema addition for `total_driver_pay_effective`, edge function security + updates, a new hook, modifications to `useOrdersWithProgress`, merging aggregates into 5 Analytics calculation blocks, admin buttons, cache invalidation, and cron setup.

## Phase 1: Backend Updates (Steps 1-3)

### Step 1: Database Migration
Add `total_driver_pay_effective` column to both tables:
```sql
ALTER TABLE analytics_locked_daily ADD COLUMN total_driver_pay_effective NUMERIC DEFAULT 0;
ALTER TABLE analytics_locked_daily_staging ADD COLUMN total_driver_pay_effective NUMERIC DEFAULT 0;
```

### Step 2: Secure + Update `recompute-analytics-aggregates`

**Security (review point #1):** Add dual auth matching `compute-heatmap` pattern:
- Accept `CRON_SECRET` via `Authorization: Bearer <CRON_SECRET>` for cron jobs
- Accept authenticated admin users via JWT + role check from `user_roles` table
- Reject all other callers with 401

**New column computation:** During dispatcher aggregation, for each order:
- Look up if `driver1_id` is a company driver via the existing `driverMap`
- If company driver: `effectiveDriverPay = freight` (instead of raw driver pay)
- If not: `effectiveDriverPay = driverPay` (normal)
- Sum into new `total_driver_pay_effective` field on dispatcher rows
- For driver rows: `total_driver_pay_effective = total_driver_pay` (no override needed at driver level)

Also update the staging-to-main copy to include the new column in the SELECT list.

### Step 3: Re-run recompute + validate
- Deploy the updated edge function
- Invoke it to repopulate data with the new column
- Run validate to confirm 0 mismatches still hold

## Phase 2: Frontend Hook (Step 4)

### Step 4: Create `src/hooks/useAnalyticsAggregates.ts`

**Three query variants:**

**A. Date-filtered (dispatcher perf, driver analytics, totals row):**
- Accepts `entityType`, `dateType`, `startDate`, `endDate`
- Query: `.from("analytics_locked_daily").select("*").eq("entity_type", ...).eq("date_type", ...).gte("date", startDate).lte("date", endDate)`
- Paginate with `.range()` loop (safety cap: 50 iterations = 50k rows max, log warning if hit)
- Groups rows by `entity_id`, sums metrics client-side
- `staleTime: 15 * 60 * 1000` (15 minutes)
- Returns `Record<entityId, { totalFreight, totalDriverPay, totalDriverPayEffective, totalMiles, totalDhMiles, orderCount, isCompanyDriver, entityName }>`

**B. All-time aggregated (all-time tiers -- Step 7):**
- No date filter, `entityType = 'driver'`, `dateType = 'pickup'`
- **Must paginate** all ~16k driver rows (32k total / 2 date types)
- Groups by `entity_id`: `SUM(total_freight)` for all-time gross, `MIN(date)` for first pickup
- Safety cap: 50 iterations

**C. All-time daily rows (gross rankings -- Step 8):**
- No date filter, `entityType = 'driver'`, `dateType = 'delivery'`
- Returns raw daily rows (not grouped) for client-side weekly bucketing
- **Must paginate** all ~16k rows
- Safety cap: 50 iterations

**Query key structure:**
- `["analytics-aggregates", entityType, dateType, startDate, endDate]` for date-filtered
- `["analytics-aggregates-alltime", entityType, dateType]` for all-time variants

## Phase 3: Order Fetching Update (Step 5)

### Step 5: Update `useOrdersWithProgress`

Add feature flag:
```typescript
const usePrecomputed = typeof window !== 'undefined'
  && localStorage.getItem("analytics_use_raw_orders") !== "true";
```

When `usePrecomputed` is true (default):
- Keep Phase 1 (unlocked orders via `get-all-unlocked-orders`) unchanged
- **Skip Phase 2 entirely** -- no locked batch loop
- Set progress: `lockedLoaded: 0, lockedTotal: 0, isLoadingMore: false, isComplete: true`
- Add `usePrecomputed: true` to return value
- `transformOrders` only processes unlocked orders
- Still sync to `["orders"]` cache (unlocked-only -- other pages have their own fetch)

When `usePrecomputed` is false (fallback):
- Run current full-fetch path unchanged -- zero code deletion

Add `usePrecomputed` to the `LoadingProgress` interface.

## Phase 4: Analytics Merge Points (Steps 6-10)

### Step 6: Update loading UI (lines 2242-2315)

When `progress.usePrecomputed` is true:
- Show "Active Orders" progress bar (unchanged)
- Replace "Archived Orders" bar with static: `CheckCircle` icon + "Archived: Precomputed" text (green)
- Loading completes when unlocked orders finish

### Step 7: Merge into Dispatcher Performance (line 1306)

Current `dispatcherAnalytics` reduces ALL `filteredOrders`. Change to:

1. The existing reduce loop processes only unlocked `filteredOrders` (small set)
2. Call `useAnalyticsAggregates("dispatcher", dateType, startDate, endDate)` where `dateType = filterType === "month" ? "delivery" : "pickup"`
3. After the reduce, merge locked aggregates into the accumulator:
   - For each key in precomputed data, add `totalFreight`, `totalMiles`, `totalDhMiles`, `orderCount` to existing or new entry
   - Use `total_driver_pay_effective` (not `total_driver_pay`) for `totalDriverRate` -- this already has the company driver override applied
4. The `latestPickupDate` field: set to null for precomputed entries (only needed for deleted dispatcher salary filtering, which is a secondary concern)

**Key matching (review point #4):** Precomputed `entity_id` = `booked_by` value, which matches the accumulator key `order.bookedBy` on line 1307. Confirmed identical.

### Step 8: Merge into Totals Row (line 1465)

Same merge pattern as dispatcher perf:
- Reduce unlocked `ordersForTotals` for unlocked totals
- Sum precomputed dispatcher aggregates (filtered by supervisor if `selectedSupervisor !== "all"`)
- Use `total_driver_pay_effective` for `totalDriverRate`

For supervisor filtering of precomputed data: lookup `entity_id` (booked_by) in `dispatcherProfiles` to get `user_id`, then check supervisor assignment. Same logic as existing `ordersForTotals` filter.

### Step 9: Merge into Driver Analytics (line 1750)

Current `driverAnalytics` reduces `filteredOrders` by `order.driverName`. Change to:

1. Reduce only unlocked orders (keyed by driver name)
2. Call `useAnalyticsAggregates("driver", dateType, startDate, endDate)`
3. Merge: precomputed data is keyed by `entity_id` (driver UUID). Use `entity_name` from precomputed rows as the merge key (driver name). This handles deleted/archived drivers (review point #3) since `entity_name` was resolved at rebuild time with fallback to `deleted_driver1_name`.
4. For each precomputed entry, add `totalDriverRate` (raw `total_driver_pay` -- no company driver override at driver level), `totalMiles`, `orderCount`

### Step 10: Merge into All-Time Tiers (line 1719)

Current `driverAnalyticsAllTime` reduces ALL `orders` for total gross and first pickup date per driver.

1. Reduce only unlocked orders for all-time totals (small set)
2. Call all-time aggregated variant: driver, pickup, no date filter
3. For each precomputed driver: `totalGross = SUM(total_freight)`, `firstPickupDate = MIN(date)`
4. Merge with unlocked totals per driver name (using `entity_name`)
5. Feed into `calculateGrossTier` unchanged

### Step 11: Merge into Gross Rankings (line 1958)

Current `driverGrossRankings` iterates ALL `orders`, groups by driver and delivery week (Tuesday-Monday).

1. Iterate only unlocked orders for weekly grouping (small set)
2. Call all-time daily rows variant: driver, delivery, no date filter
3. For each precomputed row: parse `date`, compute `startOfWeek(new Date(year, month-1, day), { weekStartsOn: 2 })`, bucket into weekly data by `entity_name` (driver name)
4. Merge weekly buckets: for each driver, combine unlocked + locked weekly data
5. The truck tracking (`driverTrucks`) and team detection (`driverIsTeam`, `driverTeammates`) still come from the unlocked orders reduce. Precomputed data doesn't carry these -- acceptable since gross rankings primarily show active drivers who will have recent unlocked orders, and the `driverNameToCurrentTruck` lookup from drivers data provides the current truck number.
6. First/last week trimming operates on merged sorted week keys -- unchanged

**Company driver note (review point #2):** Gross rankings use raw `totalDriverPay` (not effective). If a driver's company status changed mid-period, locked rows reflect status at rebuild time. Documented as acceptable -- nightly rebuild corrects within 24 hours.

## Phase 5: Admin UI + Cron (Steps 12-13)

### Step 12: Add Admin Buttons (after line 2328)

Two buttons visible only when `isAdmin`, placed next to the "Analytics" heading:

**"Recompute"** button:
- Calls `supabase.functions.invoke("recompute-analytics-aggregates")`
- Shows loading spinner during call
- On success: toast "Aggregates rebuilt: X rows in Yms"
- **Cache invalidation (review point #5):** After successful recompute, call `queryClient.invalidateQueries({ queryKey: ["analytics-aggregates"] })` and `queryClient.invalidateQueries({ queryKey: ["analytics-aggregates-alltime"] })` to force immediate refresh

**"Validate"** button:
- Calls `supabase.functions.invoke("validate-analytics-aggregates", { body: { startDate, endDate, dateType } })`
- Shows a dialog with results: "0 mismatches" or list of diffs

### Step 13: Cron Job Setup

Run via Supabase SQL editor (not migration -- contains project-specific secrets):
```sql
SELECT cron.schedule(
  'nightly-recompute-analytics',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/recompute-analytics-aggregates',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.settings.cron_secret', true) || '"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

Uses `CRON_SECRET` (not anon key) matching the dual auth pattern. Requires `pg_cron` and `pg_net` extensions enabled.

## Implementation Sequence

1. Migration: add `total_driver_pay_effective` column
2. Update `recompute-analytics-aggregates` edge function (security + new column)
3. Deploy, re-run recompute, validate
4. Create `src/hooks/useAnalyticsAggregates.ts`
5. Update `src/hooks/useOrdersWithProgress.ts` with feature flag
6. Update Analytics loading UI
7. Merge into dispatcher performance
8. Merge into totals row
9. Merge into driver analytics
10. Merge into all-time tiers
11. Merge into gross rankings
12. Add admin buttons with cache invalidation
13. Set up cron job

## Files Changed

| File | Action |
|------|--------|
| `supabase/functions/recompute-analytics-aggregates/index.ts` | Modify: add dual auth + `total_driver_pay_effective` |
| `src/hooks/useAnalyticsAggregates.ts` | New file |
| `src/hooks/useOrdersWithProgress.ts` | Modify: skip locked fetch when precomputed |
| `src/pages/Analytics.tsx` | Modify: 5 merge points + loading UI + admin buttons |

## Key Risk Mitigations

- **Security:** Dual auth (CRON_SECRET or admin JWT) on recompute endpoint -- no open destructive endpoints
- **Fallback:** `localStorage.analytics_use_raw_orders = "true"` restores full raw-order path instantly
- **Pagination safety:** 50-iteration cap on all `.range()` loops with warning log
- **Cache invalidation:** Admin recompute button invalidates all aggregate query keys immediately
- **Deleted drivers:** `entity_name` from precomputed data used as fallback -- no data loss for archived drivers
- **staleTime:** 15 minutes for aggregate queries -- no unnecessary refetches


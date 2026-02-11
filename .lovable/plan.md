

## Fix Empty Days: Three Issues

### Problem Summary

1. **Dispatcher backfill**: The current RPC uses current `dispatcher_id` assignments, but drivers switch dispatchers over time. Historical data is attributed to the wrong dispatcher. Solution: snapshot empty days daily into a table and read from snapshots for past dates.
2. **Team double-counting**: When a truck has driver1 and driver2, the RPC counts the empty day twice (once per driver). For teams, it should count as 1 empty day per truck-day.
3. **Late delivery exclusion**: If `delivery_end_datetime` is at or after 6pm Chicago time, the delivery day should NOT count as empty (driver delivered late, no realistic time for a new load).

---

### Changes

| Location | Change |
|----------|--------|
| Database migration | Create `dispatcher_daily_empty_days` snapshot table |
| Database migration | Update `calculate_empty_days_by_dispatcher` RPC to fix team counting and 6pm rule |
| New edge function | `record-empty-days` -- runs daily, calls updated RPC and upserts into snapshot table |
| `src/hooks/useDailyDriverStats.ts` | Change `fetchEmptyDaysByDispatcher` to read from snapshot table for past dates, use live RPC only for current day |

---

### 1. Database: Snapshot table

```sql
CREATE TABLE dispatcher_daily_empty_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_id uuid NOT NULL REFERENCES profiles(user_id),
  office text NOT NULL,
  date date NOT NULL,
  empty_day_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(dispatcher_id, date)
);
```

Index on `(date, office)` for range queries.

### 2. Database: Fix RPC (team counting + 6pm rule)

Update `calculate_empty_days_by_dispatcher` with two key changes:

**Team fix**: Instead of generating per-driver rows and counting each, generate per-truck rows. A truck-day is empty when NEITHER driver1 nor driver2 has a pickup or is in transit. This naturally counts team trucks as 1.

Approach:
- Join `drivers` to `trucks` (via `driver1_id` or `driver2_id`) to get truck assignments
- Generate (truck, date) pairs instead of (driver, date)
- For each truck-day, check if ANY driver on that truck has a pickup or is in transit
- Group by dispatcher (from driver1's dispatcher_id, since both drivers on a truck share the same dispatcher)

**6pm rule**: Add a condition to the `driver_orders` CTE: if `delivery_end_datetime` is not null and its time component is >= 18:00 (times stored as Chicago in +00 offset), extend the "in transit" window to include the delivery day itself. Effectively: when `delivery_end_datetime::time >= '18:00'`, treat `effective_dd` as `delivery_date + 1` so the delivery day is NOT empty.

### 3. Edge function: `record-empty-days`

- Authenticated via `CRON_SECRET` (same pattern as `record-dispatcher-driver-counts`)
- Calls the updated RPC for yesterday's date (single day)
- Upserts results into `dispatcher_daily_empty_days`
- Scheduled to run daily at 1am Chicago time

### 4. Hook update

`fetchEmptyDaysByDispatcher` becomes a hybrid:
- For date ranges entirely in the past: query `dispatcher_daily_empty_days` table, group by `dispatcher_id`
- If range includes today: query table for past days + call RPC for today only, merge results
- This ensures historical data reflects the dispatcher assignment at the time it was recorded

---

### Technical Details

**Team counting logic (SQL sketch)**:
```sql
-- Instead of per-driver, work per-truck
WITH truck_dates AS (
  SELECT t.id AS truck_id,
         COALESCE(d1.dispatcher_id, d2.dispatcher_id) AS dispatcher_id,
         p.office::text AS office,
         dt::date AS target_date
  FROM trucks t
  LEFT JOIN drivers d1 ON d1.id = t.driver1_id AND d1.is_active = true
  LEFT JOIN drivers d2 ON d2.id = t.driver2_id AND d2.is_active = true
  JOIN profiles p ON p.user_id = COALESCE(d1.dispatcher_id, d2.dispatcher_id)
  CROSS JOIN generate_series(...)
  WHERE (d1.id IS NOT NULL OR d2.id IS NOT NULL)
    AND COALESCE(d1.dispatcher_id, d2.dispatcher_id) IS NOT NULL
)
-- Then check if ANY driver on the truck has activity
```

**6pm rule (SQL sketch)**:
```sql
-- In the effective_dd calculation, account for late delivery
CASE
  WHEN o.delivery_end_datetime IS NOT NULL
       AND o.delivery_end_datetime::time >= '18:00:00'
  THEN o.delivery_datetime::date + 1  -- extends transit to cover delivery day
  WHEN o.original_delivery_datetime IS NOT NULL
       AND o.original_delivery_datetime::date < o.delivery_datetime::date
  THEN o.original_delivery_datetime::date
  ELSE o.delivery_datetime::date
END AS effective_dd
```

This means if a driver delivers with an end window of 6pm or later, the delivery day itself is NOT counted as empty (they were effectively working/in-transit all day).


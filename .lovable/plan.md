

# Fix: Eliminate HOS-Sync CPU Spikes

## Root Cause

`hos-sync` (cron job 18) runs **every minute** and performs **individual UPDATE queries** for each driver (~50+ sequential writes). When this overlaps with `get-truck-distances-batch` (every 5 min) and active user queries, the connection pool saturates, causing cascading statement timeouts and 80%+ CPU.

## Changes

### 1. Batch all driver updates into a single query (`supabase/functions/hos-sync/index.ts`)

**Current code** (lines 192-210): Loops through trucks/drivers and runs individual `supabase.from('drivers').update({...}).eq('id', driver.id)` for each driver.

**New approach**: Collect all updates into an array, then execute a single RPC call or a single bulk-update query at the end:

```text
-- Instead of 50 individual UPDATEs, one query:
UPDATE drivers SET
  hos_drive_minutes = v.drive,
  hos_shift_minutes = v.shift,
  hos_break_minutes = v.break,
  hos_cycle_minutes = v.cycle,
  hos_status = v.status,
  hos_last_updated = v.updated
FROM (VALUES
  ('driver-id-1', 480, 660, 30, 4200, 'D', '2026-02-09 07:17:00'),
  ('driver-id-2', 300, 500, 0, 3800, 'SB', '2026-02-09 07:17:00'),
  ...
) AS v(id, drive, shift, break, cycle, status, updated)
WHERE drivers.id = v.id::uuid;
```

This replaces ~50 round-trips with **1 query**.

### 2. Reduce cron frequency from every minute to every 3 minutes

HOS timers count down slowly (minutes/hours). Updating every 60 seconds provides no meaningful benefit over every 180 seconds, but triples database load.

**Change**: Update cron job 18 schedule from `* * * * *` to `*/3 * * * *`.

### 3. Add overlap guard

If a previous `hos-sync` invocation is still running when the next one fires, they stack up. Add a Supabase-side lock check (or a simple timestamp guard) so a new run skips if the previous one hasn't finished.

## Implementation Details

### File: `supabase/functions/hos-sync/index.ts`

Replace the per-driver update loop (lines ~185-225) with:

1. Collect updates into an array: `{ id, drive, shift, break, cycle, status, updated }[]`
2. Build a single SQL values clause
3. Execute via `supabase.rpc('bulk_update_hos')` or raw SQL through the service role client

### New RPC function (database migration)

```sql
CREATE OR REPLACE FUNCTION bulk_update_hos(updates jsonb)
RETURNS integer AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE drivers d SET
    hos_drive_minutes = (u->>'drive')::int,
    hos_shift_minutes = (u->>'shift')::int,
    hos_break_minutes = (u->>'break')::int,
    hos_cycle_minutes = (u->>'cycle')::int,
    hos_status = u->>'status',
    hos_last_updated = (u->>'updated')::timestamp
  FROM jsonb_array_elements(updates) AS u
  WHERE d.id = (u->>'id')::uuid;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Cron schedule update (SQL)

```sql
SELECT cron.alter_job(18, schedule := '*/3 * * * *');
```

## Impact

| Metric | Before | After |
|--------|--------|-------|
| DB queries per hos-sync run | ~50 | 1 |
| Runs per hour | 60 | 20 |
| Total HOS queries per hour | ~3,000 | 20 |
| Connection pool slots consumed | 50 sequential | 1 |

That is a **99.3% reduction** in HOS-related database load.

## Testing

1. Deploy the updated `hos-sync` edge function
2. Check edge function logs to confirm single bulk update executes successfully
3. Verify driver HOS data still updates correctly on the fleet/dashboard pages
4. Monitor CPU usage over 30 minutes -- spikes at cron boundaries should disappear
5. Confirm no statement timeouts in postgres logs during the monitoring window


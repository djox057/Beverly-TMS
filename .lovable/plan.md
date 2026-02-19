

## Optimize `update-truck-distances` -- Implementation Plan

### Change 1: Filter orders to `locked = false` + database migration

**Database migration** (single migration with both items):

```sql
-- Partial composite index for the filtered join
CREATE INDEX IF NOT EXISTS idx_orders_truck_locked
ON orders (truck_id, locked)
WHERE locked = false;

-- Advisory lock RPC (ship now, used in Change 2)
CREATE OR REPLACE FUNCTION public.try_advisory_lock_truck_distances()
RETURNS boolean
LANGUAGE sql
AS $$ SELECT pg_try_advisory_xact_lock(73489221); $$;
```

Note: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block (which migrations use), so we use regular `CREATE INDEX IF NOT EXISTS`. The index is small (only active orders) and should build in under a second.

**File: `supabase/functions/update-truck-distances/index.ts`**

Add `.eq('orders.locked', false)` to the trucks query after `.order('id', { ascending: true })` (around line 236).

Ship this, deploy, and measure runtime via edge function logs before proceeding.

### Change 2: Advisory lock concurrency guard

**File: `supabase/functions/update-truck-distances/index.ts`**

Add at the top of the handler, after creating the Supabase client and before Step 1:

```text
const { data: lockAcquired } = await supabase.rpc('try_advisory_lock_truck_distances');
if (!lockAcquired) {
  console.log('Skipping: previous run still in progress');
  return new Response(JSON.stringify({ skipped: true, reason: 'concurrent run' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}
```

**Post-ship verification:** After deploying, check edge function logs during the next cron cycle to confirm that overlapping invocations are actually blocked. If `pg_try_advisory_xact_lock` releases too early due to autocommit, switch the RPC to session-level `pg_try_advisory_lock(73489221)` and add a cleanup RPC call (`pg_advisory_unlock(73489221)`) at the end of the function (both success and error paths).

### Change 3: Strip unused columns + fix `!inner` bug

**File: `supabase/functions/update-truck-distances/index.ts`**

Replace the nested select (lines 212-230) to remove `address`, `zip_code`, `datetime` from `pickup_drops` and change `pickup_drops!inner(` to `pickup_drops(`.

Bug fix: removing `!inner` means trucks whose orders have zero pickup_drops are no longer silently excluded from results. They now flow through the zero-miles classification path correctly.

### Files Modified

1. New database migration -- partial index + advisory lock RPC
2. `supabase/functions/update-truck-distances/index.ts` -- all three changes applied sequentially


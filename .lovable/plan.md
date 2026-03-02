

## CPU Spike Optimization -- Implementation Plan

### Overview

Five changes targeting the 37% CPU spike, executed in order of safety and impact.

---

### Step 1: Cron Schedule Tuning (SQL insert -- immediate relief)

Update the existing cron job to run every 10 minutes instead of every 5, offset to `:03,:13,:23,:33,:43,:53`.

- **Method**: Use the Supabase SQL insert tool (not migration -- this is data) to run:
  ```text
  UPDATE cron.job 
  SET schedule = '3,13,23,33,43,53 * * * *' 
  WHERE jobname = 'update-truck-distances-cron';
  ```
- Note: Will overlap with hos-sync at :13 and :43, which is acceptable given Steps 2-3.

---

### Step 2: Bulk RPC for Truck Distance Updates (SQL migration)

Create a new database function `bulk_update_truck_distances(updates jsonb)` using `jsonb_to_recordset`.

- **Migration SQL**:
  ```text
  CREATE OR REPLACE FUNCTION public.bulk_update_truck_distances(updates jsonb)
  RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = 'public' AS $$
    UPDATE trucks t
    SET miles_away = u.miles_away,
        eta_minutes = u.eta_minutes
    FROM (
      SELECT id, miles_away, eta_minutes
      FROM jsonb_to_recordset(updates) AS x(id uuid, miles_away integer, eta_minutes integer)
    ) u
    WHERE t.id = u.id;
  $$;
  ```

---

### Step 3: Flatten Nested Query + Bulk RPC + Shared Samsara Import

Refactor `supabase/functions/update-truck-distances/index.ts`:

**3a. Create shared Samsara utility** at `supabase/functions/_shared/samsara.ts`:
- Extract the core Samsara fetch logic (API calls with timeout/circuit breaker awareness, truck matching, location validation) from `samsara-locations/index.ts` into a reusable async function.
- The shared function will accept Supabase client + API keys, fetch from Samsara APIs directly, match against DB trucks, and return a `TruckLocation[]` array.
- The existing `samsara-locations/index.ts` edge function will import and use this shared function (preserving its caching/locking layer on top).

**3b. Flatten the nested query** in `update-truck-distances/index.ts` (lines 179-204):
- Replace the single nested PostgREST select with the flat batch-fetch pattern:
  - Stage 1: `supabase.from('trucks').select('id, truck_number, status').not('driver1_id', 'is', null)`
  - Stage 2: `supabase.from('orders').select('id, truck_id, load_number, status, pickup_datetime, canceled, locked').in('truck_id', truckIds).eq('locked', false)`
  - Stage 3 (parallel): `supabase.from('order_files').select('id, order_id, file_category').in('order_id', orderIds)` and `supabase.from('pickup_drops').select('id, order_id, type, city, state, arrived_at, latitude, longitude').in('order_id', orderIds)`
  - Chunk `.in()` queries at 200 IDs max per existing convention
  - Manual assembly using Maps

**3c. Replace batch UPDATE loop** (lines 272-297):
- Remove `DB_BATCH_SIZE` constant
- Replace the for-loop with a single RPC call:
  ```text
  await supabase.rpc('bulk_update_truck_distances', {
    updates: JSON.stringify(allUpdates.map(u => ({
      id: u.truckId, miles_away: u.miles_away, eta_minutes: u.eta_minutes
    })))
  });
  ```

**3d. Import Samsara directly** (lines 152-168):
- Replace the HTTP fetch to `samsara-locations` with a direct import from `../_shared/samsara.ts`
- This eliminates the network round-trip overhead of edge-function-to-edge-function HTTP calls

---

### Step 4: Client-Side Polling Jitter

**4a. Add jitter helper** to `src/lib/utils.ts`:
```text
export function jitteredInterval(baseMs: number, maxJitterMs = 15000): number {
  return baseMs + Math.floor(Math.random() * maxJitterMs);
}
```

**4b. Apply jitter** using `useMemo(() => jitteredInterval(baseMs), [])` to stabilize across re-renders:

| File | Hook | Current | Change |
|------|------|---------|--------|
| `src/hooks/useDashboard.ts` | `useDashboardStats` | `refetchInterval: 60000` | `useMemo(() => jitteredInterval(60000), [])` |
| `src/hooks/useDashboard.ts` | `useRecentOrders` | `refetchInterval: 60000` | `useMemo(() => jitteredInterval(60000), [])` |
| `src/hooks/useRecoveryTrucks.ts` | `useRecoveryTrucks` | `refetchInterval: 60000` | `useMemo(() => jitteredInterval(60000), [])` |
| `src/hooks/useReportsDateWindowAdapter.ts` | drivers query (line 440) | `refetchInterval: 60000` | `useMemo(() => jitteredInterval(60000), [])` |

Each file will need to import `useMemo` (if not already) and `jitteredInterval` from `@/lib/utils`.

---

### Step 5: Update `samsara-locations/index.ts` to use shared utility

Refactor `samsara-locations/index.ts` to import the core fetch logic from `../_shared/samsara.ts` instead of having it inline. The caching layer (cache check, lock acquisition, circuit breaker) stays in the edge function; only the raw Samsara API fetch + truck matching moves to the shared file.

---

### Files Modified (8 total)

| # | File | Change |
|---|------|--------|
| 1 | SQL (insert tool) | Update cron schedule |
| 2 | SQL (migration) | Create `bulk_update_truck_distances` function |
| 3 | `supabase/functions/_shared/samsara.ts` | **New** -- shared Samsara fetch logic |
| 4 | `supabase/functions/update-truck-distances/index.ts` | Flatten query + bulk RPC + shared import |
| 5 | `supabase/functions/samsara-locations/index.ts` | Refactor to use shared utility |
| 6 | `src/lib/utils.ts` | Add `jitteredInterval` helper |
| 7 | `src/hooks/useDashboard.ts` | Apply jitter to polling |
| 8 | `src/hooks/useRecoveryTrucks.ts` | Apply jitter to polling |
| 9 | `src/hooks/useReportsDateWindowAdapter.ts` | Apply jitter to drivers query |

### Expected Impact

Peak concurrent DB queries reduced from ~50 to ~15-20 (jitter). Heaviest single query eliminated (flatten). N sequential writes replaced by 1 bulk RPC. Cron frequency halved. Combined: **~37% CPU down to ~15-20%**.


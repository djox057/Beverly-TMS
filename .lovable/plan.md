

## CPU Spike Optimization -- Implementation Plan (COMPLETED)

### Overview

Five changes targeting the 37% CPU spike, executed in order of safety and impact.

**STATUS: ✅ ALL STEPS IMPLEMENTED**

---

### Step 1: Cron Schedule Tuning ✅

Updated `update-truck-distances-cron` from every 5 minutes to every 10 minutes.
Schedule: `3,13,23,33,43,53 * * * *`

---

### Step 2: Bulk RPC for Truck Distance Updates ✅

Created `bulk_update_truck_distances(updates jsonb)` function using `jsonb_to_recordset`.
Replaces N sequential UPDATE statements with a single bulk RPC call.

---

### Step 3: Flatten Nested Query + Bulk RPC + Shared Samsara Import ✅

- **3a.** Created shared utility at `supabase/functions/_shared/samsara.ts`
- **3b.** Flattened nested PostgREST query in `update-truck-distances` to flat batch-fetch pattern with 200-ID chunking
- **3c.** Replaced batch UPDATE loop with single `bulk_update_truck_distances` RPC call
- **3d.** Replaced HTTP fetch to `samsara-locations` with direct TypeScript import

---

### Step 4: Client-Side Polling Jitter ✅

Added `jitteredInterval(baseMs, maxJitterMs)` helper to `src/lib/utils.ts`.
Applied via `useMemo` to:
- `useDashboardStats` (60s + 0-15s jitter)
- `useRecentOrders` (60s + 0-15s jitter)
- `useRecoveryTrucks` (60s + 0-15s jitter)
- `useReportsDateWindowAdapter` drivers query (60s + 0-15s jitter)

---

### Step 5: Samsara Locations Refactored ✅

Refactored `samsara-locations/index.ts` to import core fetch logic from `../_shared/samsara.ts`.
Caching layer (cache check, lock acquisition, circuit breaker) stays in the edge function.

---

### Files Modified

| # | File | Change |
|---|------|--------|
| 1 | SQL migration | Updated cron schedule via `cron.alter_job` |
| 2 | SQL migration | Created `bulk_update_truck_distances` function |
| 3 | `supabase/functions/_shared/samsara.ts` | **New** -- shared Samsara fetch logic |
| 4 | `supabase/functions/update-truck-distances/index.ts` | Flatten query + bulk RPC + shared import |
| 5 | `supabase/functions/samsara-locations/index.ts` | Refactored to use shared utility |
| 6 | `src/lib/utils.ts` | Added `jitteredInterval` helper |
| 7 | `src/hooks/useDashboard.ts` | Applied jitter to polling |
| 8 | `src/hooks/useRecoveryTrucks.ts` | Applied jitter to polling |
| 9 | `src/hooks/useReportsDateWindowAdapter.ts` | Applied jitter to drivers query |

### Expected Impact

Peak concurrent DB queries reduced from ~50 to ~15-20 (jitter). Heaviest single query eliminated (flatten). N sequential writes replaced by 1 bulk RPC. Cron frequency halved. Combined: **~37% CPU down to ~15-20%**.

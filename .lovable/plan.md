

## Server-Side Caching for Samsara Locations (with Thundering Herd Protection)

### Problem
With 100+ concurrent users, every browser tab independently calls `samsara-locations`, each hitting the Samsara API. When the cache expires, dozens of simultaneous requests could all call the external API at once.

### Solution
A single-row database cache with an atomic locking mechanism so only one caller fetches from Samsara while all others return slightly stale (but valid) cached data.

### Changes

**1. Database Migration: Create `samsara_locations_cache` table**

```sql
CREATE TABLE IF NOT EXISTS public.samsara_locations_cache (
  id text PRIMARY KEY DEFAULT 'latest',
  locations jsonb NOT NULL DEFAULT '[]',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  is_fetching boolean NOT NULL DEFAULT false,
  fetch_started_at timestamptz
);

ALTER TABLE public.samsara_locations_cache ENABLE ROW LEVEL SECURITY;

INSERT INTO public.samsara_locations_cache (id, locations, fetched_at, is_fetching)
VALUES ('latest', '[]', '1970-01-01T00:00:00Z', false)
ON CONFLICT (id) DO NOTHING;
```

**2. Modify `supabase/functions/samsara-locations/index.ts`**

Add constants:
- `CACHE_TTL_MS = 5 * 60 * 1000` (5 minutes)
- `FETCH_LOCK_TIMEOUT_MS = 30 * 1000` (30 seconds -- safety timeout for stuck fetches)

New logic inserted after circuit breaker check, before truck/Samsara fetch:

1. Read cache row (`locations`, `fetched_at`, `is_fetching`, `fetch_started_at`)
2. If `fetched_at` is less than 5 minutes old: return cached `locations` immediately
3. If stale:
   a. Atomically attempt: `UPDATE ... SET is_fetching = true, fetch_started_at = now() WHERE is_fetching = false OR fetch_started_at < now() - 30s`
   b. If zero rows updated (another caller already fetching): return stale cached `locations` with `stale: true`
   c. If one row updated (we won the lock): proceed with existing Samsara API fetch logic
4. After successful fetch and location processing:
   - `try { UPDATE cache SET locations = ..., fetched_at = now(), is_fetching = false } catch { log error }`
   - Return fresh data regardless of cache write success
5. On fetch failure (all Samsara calls fail):
   - `try { UPDATE cache SET is_fetching = false } catch { log }`
   - Return empty/stale as before

**3. Update `src/hooks/useSamsaraLocations.ts`**

- `refetchInterval`: 15 min -> 20 min
- `staleTime`: 14 min -> 19 min
- `gcTime`: 30 min -> 45 min

### Edge Function Flow (pseudocode)

```text
1. CORS check (unchanged)
2. Circuit breaker check (unchanged)
3. Read cache row
4. If fresh (< 5 min) -> return cached locations
5. If stale -> atomic lock attempt
   - Lost lock -> return stale cached locations
   - Won lock -> continue
6. Fetch trucks from DB (existing)
7. Fetch from Samsara API (existing)
8. Circuit breaker update (existing)
9. Match vehicles, build locations array (existing)
10. try { UPDATE cache with new data + is_fetching=false } catch { log }
11. Return locations
```

### Impact
- At most 1 Samsara API call per 5 minutes regardless of user count
- 100+ concurrent users on cache expiry: 1 fetches, 99 get stale data instantly
- Edge function CPU drops ~95%+ for this function (most calls = single DB read)
- 30-second safety timeout prevents permanent lock from crashed functions




# Samsara Locations: Timeout Protection & Circuit Breaker

## Overview
Two-layer defense to prevent database connection exhaustion when the Samsara API is slow or down.

## Priority 1: AbortController Timeout

**File:** `supabase/functions/samsara-locations/index.ts`

Wrap each of the 4 Samsara API fetch calls (2 API keys x 2 endpoints) with a 15-second AbortController timeout. On abort, log a warning and continue to the next endpoint/key. If all calls timeout, return `{ locations: [], stale: true }` with status 200.

Key behavior:
- Each fetch gets its own independent 15s timeout
- `clearTimeout` in both success and error paths to prevent timer leaks
- On `AbortError`, continue to next endpoint (don't throw)
- If some keys succeed and others timeout, still return the partial data that was collected

**File:** `supabase/config.toml`

Add `verify_jwt = false` for `samsara-locations` since server-to-server callers (check-delivery-etas, update-truck-distances) invoke it without a user JWT.

## Priority 2: DB-backed Circuit Breaker

**Migration:** Create `circuit_breaker_state` table:

```text
circuit_breaker_state
  function_name        TEXT PRIMARY KEY
  consecutive_failures INT DEFAULT 0
  circuit_open_until   TIMESTAMPTZ DEFAULT NULL
  last_success_at      TIMESTAMPTZ DEFAULT NULL
  updated_at           TIMESTAMPTZ DEFAULT now()
```

- RLS disabled (only accessed via service role key from edge functions)
- Seed with one row: `function_name = 'samsara-locations'`

**Edge function logic** added to `supabase/functions/samsara-locations/index.ts`:

1. **Before Samsara calls** -- read circuit breaker state, wrapped in try/catch. If the DB read fails (e.g., pool exhausted), log a warning and proceed anyway (the 15s AbortController still protects).

2. **If circuit is open** (`circuit_open_until > now()`) -- return `{ locations: [], stale: true, circuit_open: true }` immediately with no external calls.

3. **After successful fetch** -- reset `consecutive_failures` to 0, set `last_success_at = now()`. Wrapped in try/catch so a DB write failure doesn't discard a good Samsara response.

4. **After all fetches timeout/fail** -- increment `consecutive_failures`. If >= 3, set `circuit_open_until = now() + 5 minutes`. Also wrapped in try/catch.

## Files Changed

1. `supabase/functions/samsara-locations/index.ts` -- AbortController on all fetches + circuit breaker read/write with defensive try/catch
2. `supabase/config.toml` -- add `[functions.samsara-locations] verify_jwt = false`
3. New SQL migration -- create `circuit_breaker_state` table with seed row

## No Frontend Changes

TanStack Query already deduplicates concurrent requests with the same queryKey. The existing polling interval is already conservative. No client-side changes needed.


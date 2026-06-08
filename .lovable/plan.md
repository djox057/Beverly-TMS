# Verify search-orders returns all unlocked rows in the first batch

## Goal
Lock in the fix so a wide delivery-date filter on `/orders` always returns every unlocked order in the first 500-row batch, matching the totals you'd get from summing narrower date ranges.

## DB-verified baseline (Jan 1 – Jun 7, 2026)
Run against production right now:
- unlocked: 239
- locked: 25,034
- total: 25,273

These are the numbers the `/orders` UI should display with this filter once the edge function change is deployed.

## Automated test
Add `supabase/functions/search-orders/index_test.ts` with a Deno test that:

1. Invokes the deployed `search-orders` function with:
   - `deliveryDateFrom: 2026-01-01 00:00:00`
   - `deliveryDateTo:   2026-06-07 23:59:59`
   - `excludeBookedByCompanyId`: the BG Prime company id (looked up once at test start)
   - `limit: 500`, `offset: 0`
2. Asserts:
   - `response.totalCount === 25273` (allowing a small tolerance, e.g. ±50, since new orders may be created)
   - Every order in the first batch with `locked === false` is present — i.e. `orders.filter(o => !o.locked).length` equals the live DB unlocked count (queried via a `supabase-js` client inside the test for tolerance).
   - The first N rows of the response are all `locked === false` (proves server-side `order by locked asc` is in effect).
3. Uses `SUPABASE_SERVICE_ROLE_KEY` from env so the test can both call the function and query the DB for the reference count.

## Manual UI check (one-time)
After deploy, open `/orders`, apply the Jan 1 → Jun 7 2026 delivery filter, and confirm the "unlocked" count at the top is 239 (±a few) and the total matches ~25,273.

## Files
- New: `supabase/functions/search-orders/index_test.ts`
- No production code changes — the edge function fix is already in place.

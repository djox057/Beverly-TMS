
## Goal
Replace the current staged loading on /reports (drivers/trucks → orders/pickup_drops → order_files) with a single request that returns everything needed for the initial render.

## Current behavior (why it feels slow)
`useReportsDateWindowAdapter` fires ~10 parallel React Query fetches from the browser:
- `adapter-trucks`, `adapter-trailers`, `adapter-drivers`, `adapter-dispatchers`, `adapter-companies`, `adapter-truck-notes`, `adapter-lost-day-notes`, `adapter-off-duty-*`, `adapter-last-loads`
- Plus `reports-date-window-orders` (edge function for orders) which internally batch-fetches `pickup_drops`, `order_transfers`, `recovery_history`, then later `adapter-order-files`

Each request pays:
- TLS + auth round-trip from the user's browser to Supabase
- Sequential dependency (orders → orderIds → order_files → file URLs)
- Browser CPU on JSON parse & RQ cache writes

On a slow connection (mobile, your current 506px viewport) this stacks visibly: drivers/trucks paint, then orders, then files.

## Plan

### 1. New edge function: `reports-bootstrap`
Single POST endpoint that accepts:
```
{ priorityOffice, individualMode, currentUserDispatcherId, windowStart, windowEnd }
```
and returns one JSON payload:
```
{
  trucks, trailers, drivers, dispatchers, companies,
  truckNotes, lostDayNotes, offDutyStatuses, offDutyDispatchers,
  orders,            // already enriched (joins resolved server-side)
  pickupDrops,       // grouped by order_id
  orderTransfers,    // grouped by order_id
  recoveryHistory,   // grouped by order_id
  orderFiles,        // grouped by order_id (id, file_category, file_name, file_path)
  lastLoads          // for drivers needing last-load lookup
}
```
Runs all these as `Promise.all` server-side (same region as Postgres → milliseconds per query, no browser round-trip stacking). Honors the same office/individual-mode scoping the existing hooks apply.

Locked/archived orders stay on the existing `load-locked-orders` path (CSV cache) — they're already separate and don't block first paint.

### 2. New hook: `useReportsBootstrap`
One `useQuery({ queryKey: ['reports-bootstrap', ...scope] })` call. On success, it primes every adapter cache via `queryClient.setQueryData` using the keys the existing adapter hooks read:
- `["adapter-trucks", modeKeySuffix]`
- `["adapter-drivers", modeKeySuffix]`
- `["adapter-trailers", ...]`
- `["adapter-truck-notes", ...]`
- `["adapter-lost-day-notes", ...]`
- `["adapter-order-files", ...]`
- `["adapter-last-loads", ...]`
- `['reports-date-window-orders', windowKey, ...]`

After seeding, the existing per-slice `useQuery`s see fresh cached data with `staleTime > 0` and won't re-fetch on mount. Realtime hooks (`useReportsRealtime`, `useDriversRealtime`, etc.) keep working unchanged — they patch the same cache keys.

### 3. Fallback / safety
- If `reports-bootstrap` fails, fall back to the existing per-slice fetches (don't break the page).
- Keep the existing hooks intact; the bootstrap is purely additive and seeds caches.
- Background date-window paging (past/future windows) keeps using the existing `reports-date-window-orders` function — bootstrap only covers the initial window.

## Expected impact
- 1 HTTP round trip instead of ~10 from the browser for first paint.
- Order files arrive in the same payload as orders, eliminating the visible "orders, then files" flash.
- Server-side `Promise.all` runs queries in parallel against the DB with no per-query browser auth overhead.

## Files
- New: `supabase/functions/reports-bootstrap/index.ts`
- New: `src/hooks/useReportsBootstrap.ts`
- Edit: `src/hooks/useReportsDateWindowAdapter.ts` — call `useReportsBootstrap` once at the top so all subsequent `useQuery`s read seeded data.

## Risk / what I want to confirm before building
- The bootstrap payload could be large (all trucks + drivers + window of orders + files). Worst case I've seen referenced in your codebase is ~hundreds of orders × ~5 files each — still well under a few MB gzipped, but I'll cap `order_files` to id/category/name/path (no signed URLs; those are generated lazily as today).
- Office scoping in the edge function must exactly match what the current hooks do, or you'll see different drivers/trucks after the change.

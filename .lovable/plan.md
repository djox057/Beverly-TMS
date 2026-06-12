## Why the search bar feels slow

Tracing `useOrdersSearch` (called from `src/pages/Orders.tsx` via the search input) shows several stacked costs that compound on every keystroke:

1. **Wildcard substring scan on `orders`.** Pass 2 runs `broker_load_number ilike %term%` and `internal_load_number ilike %term%`. The existing indexes are `text_pattern_ops` (prefix only), so `%term%` falls back to a sequential scan of the full `orders` table — by far the dominant cost. `internal_load_number` is also a `bigint` cast to text via ilike, which forces a per-row cast.
2. **Many sequential round-trips.** Each search does: optional dispatcher-drivers query → exact orders query → (often) substring orders query → 4 related-rows queries (pickup_drops, order_files, transfers, recovery) → 5 entity queries (trucks, drivers, brokers, companies, trailers) → sometimes an extra companies query. That is 6–9 sequential HTTP/RLS round-trips per search, each ~80–200ms.
3. **RLS evaluated 9× per search.** Every PostgREST call re-evaluates RLS on a different table. Doing this in one SQL function (security definer) runs RLS-equivalent checks once.
4. **Debounce too short / fires on every change.** The input uses a 300ms debounce and re-issues the full pipeline even for 2-char terms, where substring fallback returns hundreds of rows that all get enriched.
5. **Over-enrichment.** Results display load #, broker, truck/driver — but we hydrate transfers, recovery_history, original_*, order_files, etc. for every match before rendering, even when most aren't shown in the search results row.
6. **No request cancellation at the network layer.** `cancelQueries` only stops React Query bookkeeping; the in-flight Supabase fetches still complete and burn server time.

## Proposed fixes (ordered by impact)

### 1. Make the DB search actually use indexes (biggest win)
Add a trigram-based index on the two search columns and switch the query to use it:

```sql
create extension if not exists pg_trgm;
create index concurrently idx_orders_broker_load_number_trgm
  on public.orders using gin (broker_load_number gin_trgm_ops);
create index concurrently idx_orders_internal_load_number_text_trgm
  on public.orders using gin ((internal_load_number::text) gin_trgm_ops);
```

With these, `ilike '%term%'` on either column becomes an index scan instead of a seq scan. Expected: substring search drops from 1–3s on a large `orders` table to <100ms.

Also keep the existing prefix path for the common "exact / prefix" case so we still benefit from the btree.

### 2. Collapse the pipeline into a single `search_orders_v2` RPC
Create one Postgres function (security invoker, so RLS still applies) that takes `term`, `bookedBy`, `dispatcherUserId`, `excludeBookedByCompanyId`, `bookedByCompanyId` and returns one JSON payload containing the matching orders **plus** their joined relations and entities. Internally it can do `select ... from orders left join lateral (...) on true` or use `json_agg` per relation.

Client replaces all 9 round-trips with one `supabase.rpc("search_orders_v2", {...})`. Expected: even with the same DB work, removes ~5–7 network/RLS hops (~400–800ms on warm cache).

### 3. Tighten client behavior
- Raise debounce from 300ms → 400ms and require **3 chars** minimum (currently 2) before issuing substring fallback. 2-char queries should only run the exact-match path.
- On every keystroke, abort the previous in-flight request with an `AbortController` passed through the Supabase fetch options, not just `cancelQueries`.
- Strip transfers / recovery_history / original_* enrichment from the search result type. The Orders list row doesn't need them; hydrate them lazily only when the user opens the row.
- Cap the substring result set at 25 (down from 100). The user almost always refines further; large result sets only slow down enrichment + render.

### 4. Skip the substring fallback entirely for numeric terms
If `term` is purely digits, only run the exact / prefix path (which already hits a btree index). Substring search on numbers rarely matches the user's intent and is the slowest case.

### 5. (Optional, after 1–4) Add a covering index for the exact path
```sql
create index concurrently idx_orders_broker_load_number_lower
  on public.orders (lower(broker_load_number));
```
and change the exact query to compare `lower(broker_load_number) = term`. Removes the case-sensitivity issue that currently forces ilike even for exact matches.

## Suggested rollout order

1. Ship the two trigram indexes (migration) — instant win, no code changes needed.
2. Add client-side guards: 3-char minimum for substring, numeric-only skip, AbortController, lower limit. Small diff in `useOrdersSearch.ts` + `Orders.tsx`.
3. Build the `search_orders_v2` RPC and switch the hook to use it; delete the enrichment stages from the client.
4. Optionally: lazy-hydrate transfers/recovery/files when the row is expanded.

## Technical notes
- All migrations must include explicit `GRANT EXECUTE` to `authenticated` and `service_role` per project memory.
- The RPC should be `security invoker` so existing RLS on `orders`, `drivers`, etc. continues to apply — no policy changes required.
- Real-time patching of search results already works via `queryClient.setQueryData`; the RPC payload should keep the same shape `transformOrders` expects so realtime patches keep working untouched.

Want me to proceed with steps 1 + 2 first (indexes + client tightening) as a quick win, then follow up with the RPC?

## What "10s" really is

The new `search_orders_v2` RPC itself is fast end-to-end on the DB:
- exact match (`18707`): **17 ms**
- substring scan (`robinson`): **123 ms**

So the 10 seconds the user sees is **not the DB query**. It is the round-trip wrapper around it. The likely contributors, in order of impact:

1. **Debounce + per-keystroke re-renders.** `useDebounce(searchTerm, 400)` only fires after the user stops typing for 400 ms. While they type, every keystroke re-runs `dataSource` / `filteredOrders` over the current page slice and re-renders the Orders grid. On a slow laptop this is a noticeable stall before the RPC even fires.
2. **RLS overhead on the RPC.** `search_orders_v2` is `SECURITY INVOKER`, so every correlated subquery (`pickup_drops`, `order_files`, `order_transfers`, `recovery_history`, `brokers`, `companies`, `trucks`, `trailers`, `drivers`, `original_*`) re-evaluates RLS for the authenticated user. Under load this turns 17 ms into hundreds of ms.
3. **Cold path through PostgREST + Edge → realtime cache patch.** The first search after a tab focus or token refresh adds ~1–2 s of auth/handshake.
4. **Substring fallback fires unnecessarily.** When the term is non-numeric and ≥3 chars, we always do the `ILIKE '%term%'` pass even though it can't use the btree indexes — it relies on the trigram index from phase 3C. If trigrams aren't in the planner's stats yet, this falls back to seq scan on 34 k rows.

## Proposed fixes (ordered by ROI)

### 1. Drop debounce from 400 ms → 150 ms and fire on Enter immediately
- Keep `useDebounce(searchTerm, 150)` for live results.
- Add an `onKeyDown` handler on the search input: when the user presses Enter, bypass the debounce and call `searchOrders(searchTerm.trim(), …)` directly.
- Result: a deliberate "I'm done typing, find it now" path that removes the 400 ms wait entirely.

### 2. Split the RPC into a two-call pattern: ids first, payload second
- New `search_orders_ids(p_term, …)` returns just `id[]` (≤ 50). Runs in <20 ms because no joins, no RLS on related tables.
- Existing `search_orders_v2` is renamed to `search_orders_hydrate(p_ids uuid[])` that takes those ids and returns the full payload.
- Client calls both in parallel only when `ids.length > 0`. The user sees results as soon as ids resolve (we can render skeleton rows for the hydrate step, or just wait 30–50 ms more).
- Why it helps: RLS on `orders` is evaluated once with a tight `WHERE id = ANY($1)` instead of through a CTE that the planner may re-evaluate per-subquery.

### 3. Skip the substring fallback for short / numeric terms
Already done for numeric. Also skip it when:
- exact branch returned ≥ 1 row (already true), AND
- the term looks like a load-number prefix (`^[A-Z0-9-]{3,}$`), so "robinson"-style fuzzy text never runs through ILIKE.
- Confirm the `pg_trgm` GIN indexes from phase 3C exist on `orders.broker_load_number` and `orders.internal_load_number`; if not, add them so the substring path is index-backed.

### 4. Pre-cancel the previous RPC on every new keystroke
- Wrap the RPC call in an `AbortController`; cancel on rerun. Today's `latestSearchKeyRef` only discards the *response*, not the *request*, so several in-flight RPCs can queue up behind each other on the connection. Cancellation frees the HTTP slot immediately.

### 5. Memoize `dataSource` / `filteredOrders` more tightly during active search
- When `isActiveSearch` is true, short-circuit `filteredOrders` to just `dataSource` (the server already filtered by load number; we still apply date-range filter, but skip the rest).
- Skip `[...results].sort(...)` if `searchResults` is already sorted in the RPC (`ORDER BY locked asc, created_at desc`).

### Technical details (for the dev)

- **Files touched (frontend)**
  - `src/hooks/useDebounce.ts` — accept a `immediateOnTrigger` callback or just lower the delay.
  - `src/hooks/useOrdersSearch.ts` — add AbortController, switch to two-call (ids → hydrate), expose a `searchNow(term)` for Enter.
  - `src/pages/Orders.tsx` — wire `onKeyDown=Enter` on the search input; tighten `dataSource` memo dependencies.
- **Files touched (DB)** — new migration:
  - `CREATE OR REPLACE FUNCTION public.search_orders_ids(p_term text, p_booked_by text, p_dispatcher_user_id uuid, p_excluded_booked_by_company_id uuid, p_booked_by_company_id uuid, p_limit int) RETURNS uuid[]` (STABLE, SECURITY INVOKER).
  - `CREATE OR REPLACE FUNCTION public.search_orders_hydrate(p_ids uuid[]) RETURNS jsonb` — body is the existing `search_orders_v2` payload assembly, but the matched CTE is just `SELECT * FROM public.orders WHERE id = ANY(p_ids)`.
  - Verify and (re)create trigram indexes:
    ```sql
    CREATE INDEX IF NOT EXISTS idx_orders_broker_load_number_trgm
      ON public.orders USING gin (broker_load_number gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_orders_internal_load_number_trgm
      ON public.orders USING gin (internal_load_number gin_trgm_ops);
    ```
  - `GRANT EXECUTE` on both new functions to `authenticated, service_role`.

### Expected outcome

- Typing "18707" + Enter → results in **~200–300 ms total** (network dominates).
- Typing "18707" and waiting → **~350 ms** (150 ms debounce + 200 ms RPC).
- Worst-case substring search → **<800 ms** with trigram index, down from multi-second.

Would you like me to also instrument the search path with `console.time` markers so we can confirm where the 10 s actually goes before/after these changes?

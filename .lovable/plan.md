
# Goal

Make `/orders` show **correct totals and unlocked counts** for any filter combination, no matter how many rows match. Stop relying on "load all orders into the browser" and stop relying on the `locked asc` trick that only works while unlocked < 500.

# What changes

## 1. New edge function: `orders-summary`

A small companion to `search-orders` that returns **only aggregates** for the same filter object — no rows, no joins.

Returns:
```json
{
  "totalCount": 25273,
  "unlockedCount": 239,
  "lockedCount": 25034,
  "invoicedCount": ...,
  "notInvoicedCount": ...,
  "freightSum": ...,
  "driverPaySum": ...
}
```

Implementation: a single SQL call against `orders` with the same WHERE clause builder shared with `search-orders` (extract filter→query into a helper inside the function file). Uses `count` + `sum() filter (where ...)` so it's one round trip.

Auth: same JWT check as `search-orders`, plus a role check (admin/manager/accounting/safety/supervisor/dispatch) — see Security below.

## 2. `search-orders` changes

- Remove the `.order("locked", { ascending: true })` hack. Default ordering becomes `delivery_datetime desc` (matches user expectation when filtering by delivery date) with `created_at desc` as tiebreaker.
- Add an explicit `lockedOnly` / `unlockedOnly` mode driven by the UI when the user wants to see just one bucket (already supported as `filters.locked`, just wire it from the page).
- Keep server-side pagination (`offset` / `limit`, default 500). No behavioral change for page 1, but the page no longer pretends the first batch is the whole result set.
- Add the same role check used by `orders-summary`.

## 3. Frontend (`src/pages/Orders.tsx` + `useFilteredOrdersSearch`)

- When any structured filter is active, call **`orders-summary` in parallel with `search-orders`** and store the aggregates separately from the row array.
- Render every summary number (unlocked count badge, totals, "X of Y") from the **summary response**, never from `orders.length`.
- Add a "Show only unlocked" toggle next to the filter bar. When on, it sets `filters.locked = false` so the server returns only unlocked rows (page 1 then becomes "all 239 unlocked" without padding from locked rows).
- Pagination UI: replace "Load more" with proper pager driven by `summary.totalCount` / `BATCH_SIZE`, so the user can jump pages instead of clicking 50 times.
- Keep the existing `["orders","filtered", …]` cache; add `["orders","filtered","summary", …]` for aggregates.

## 4. Default (no-filter) path — minimal change

Leave `useOrders` + `get-all-unlocked-orders` / `get-all-locked-orders` as-is for now. The bug we're fixing is in the filtered path. (A larger refactor to collapse all three paths into one is out of scope for this change — call it out as follow-up.)

## 5. Security

`search-orders` today only checks `auth.getUser()` exists and then uses the service role — any signed-in user can pull every column of every order. Add a role gate:

```ts
const allowed = ['admin','manager','accounting','safety','supervisor','dispatch'];
const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', userData.user.id);
if (!roles?.some(r => allowed.includes(r.role))) return 403;
```

Apply the same gate to the new `orders-summary` function.

## 6. Verification

Extend `supabase/functions/search-orders/index_test.ts` with a second test:
1. Call `orders-summary` with the Jan 1 – Jun 7 / exclude-BG-Prime filter.
2. Assert `unlockedCount === 239`, `totalCount === 25273` (±5 tolerance).
3. Call `search-orders` page 1 with `filters.locked = false` and assert it returns 239 rows.
4. Manual UI check: filter applied → unlocked badge reads 239, page count reads ~51 (25273/500), sort defaults to delivery date desc.

# Technical details

- One shared `applyFilters(query, filters)` helper inside `search-orders/index.ts` reused by `orders-summary` (copy into both files to avoid cross-function imports — Lovable edge functions can't share modules across folders).
- `orders-summary` SQL shape:
  ```sql
  select
    count(*) as total_count,
    count(*) filter (where locked = false) as unlocked_count,
    count(*) filter (where locked = true)  as locked_count,
    count(*) filter (where invoiced = true) as invoiced_count,
    coalesce(sum(freight_amount), 0) as freight_sum,
    coalesce(sum(driver_price), 0)   as driver_pay_sum
  from orders
  where ...filters...
  ```
  Run via a SECURITY DEFINER RPC `get_orders_summary(filters jsonb)` — keeps the SQL parameterized and lets us re-use Postgres indices without round-tripping a huge `count: exact` joined query.

# Files touched

- `supabase/functions/search-orders/index.ts` — remove locked-asc, add role gate, default order delivery_datetime desc.
- `supabase/functions/orders-summary/index.ts` — new.
- New migration: RPC `public.get_orders_summary(filters jsonb)` with appropriate GRANTs.
- `src/hooks/useFilteredOrdersSearch.ts` — fetch & expose summary alongside rows.
- `src/pages/Orders.tsx` — wire summary into badges/totals, add "Unlocked only" toggle, add page pager.
- `supabase/functions/search-orders/index_test.ts` — extend.

# Out of scope (call out, do later)

- Collapsing `useOrders` / `useOrdersSearch` / `useFilteredOrdersSearch` into one path.
- Replacing client-side ilike text search with a trgm-indexed server search (`broker_load_number`, `internal_load_number`).
- Pushing realtime patches into the filtered/search cache keys.

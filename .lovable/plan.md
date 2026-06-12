## Goal
Replace the 6–9 round-trip pipeline in `useOrdersSearch` with a single `supabase.rpc("search_orders_v2", {...})` call that returns matching orders fully assembled (relations + entities), so the search bar response time is bounded by one DB call + one network hop.

## Migration: `public.search_orders_v2`

Create a `security invoker` SQL function (RLS still applies, same visibility as today). Signature:

```sql
create or replace function public.search_orders_v2(
  p_term text,
  p_booked_by text default null,
  p_dispatcher_user_id uuid default null,
  p_excluded_booked_by_company_id uuid default null,
  p_booked_by_company_id uuid default null,
  p_limit int default 50
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with
  -- Stage 0: dispatcher driver scope (if any)
  dispatcher_drivers as (
    select id from public.drivers
    where p_dispatcher_user_id is not null
      and dispatcher_id = p_dispatcher_user_id
  ),
  -- Stage 1: exact / prefix match
  exact_matches as (
    select o.*
    from public.orders o
    where (
      o.broker_load_number = p_term
      or o.internal_load_number = p_term
      or o.internal_load_number ilike p_term || '-%'
    )
    and (
      p_dispatcher_user_id is null
      or (p_booked_by is not null and o.booked_by = p_booked_by)
      or o.driver1_id in (select id from dispatcher_drivers)
    )
    and (
      p_excluded_booked_by_company_id is null
      or o.booked_by_company_id is null
      or o.booked_by_company_id <> p_excluded_booked_by_company_id
    )
    and (p_booked_by_company_id is null or o.booked_by_company_id = p_booked_by_company_id)
    order by o.created_at desc
    limit p_limit
  ),
  -- Stage 2: substring fallback ONLY when exact has zero rows AND term qualifies
  substring_matches as (
    select o.*
    from public.orders o
    where (select count(*) from exact_matches) = 0
      and length(p_term) >= 3
      and p_term !~ '^\d+$'
      and (
        o.broker_load_number ilike '%' || p_term || '%'
        or o.internal_load_number ilike '%' || p_term || '%'
      )
      and ( /* same scope filters as above */ )
    order by o.created_at desc
    limit p_limit
  ),
  matched as (
    select * from exact_matches
    union all
    select * from substring_matches
  )
  -- Stage 3: assemble payload via jsonb_agg with correlated subqueries
  select coalesce(jsonb_agg(
    to_jsonb(m) ||
    jsonb_build_object(
      'pickup_drops',     (select coalesce(jsonb_agg(pd.*), '[]') from public.pickup_drops pd where pd.order_id = m.id),
      'order_files',      (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'file_category', f.file_category, 'file_name', f.file_name, 'file_path', f.file_path, 'order_id', f.order_id)), '[]') from public.order_files f where f.order_id = m.id),
      'order_transfers',  (select coalesce(jsonb_agg(
                              to_jsonb(t) ||
                              jsonb_build_object(
                                'driver1', (select to_jsonb(d) || jsonb_build_object('company', (select to_jsonb(c) from public.companies c where c.id = d.company_id)) from public.drivers d where d.id = t.driver1_id),
                                'driver2', (select to_jsonb(d) from public.drivers d where d.id = t.driver2_id),
                                'truck',   (select to_jsonb(tk) || jsonb_build_object('company', (select to_jsonb(c) from public.companies c where c.id = tk.company_id)) from public.trucks tk where tk.id = t.truck_id),
                                'trailer', (select to_jsonb(tr) from public.trailers tr where tr.id = t.trailer_id)
                              )
                            ), '[]') from public.order_transfers t where t.order_id = m.id),
      'recovery_history', (select coalesce(jsonb_agg(
                              to_jsonb(r) ||
                              jsonb_build_object(
                                'recovery_driver1', (select to_jsonb(d) from public.drivers d where d.id = r.recovery_driver1_id),
                                'recovery_driver2', (select to_jsonb(d) from public.drivers d where d.id = r.recovery_driver2_id),
                                'recovery_truck',   (select to_jsonb(tk) from public.trucks tk where tk.id = r.recovery_truck_id),
                                'recovery_trailer', (select to_jsonb(tr) from public.trailers tr where tr.id = r.recovery_trailer_id)
                              )
                            ), '[]') from public.recovery_history r where r.order_id = m.id),
      'broker',            (select to_jsonb(b) from public.brokers b where b.id = m.broker_id),
      'company',           (select to_jsonb(c) from public.companies c where c.id = m.company_id),
      'booked_by_company', (select to_jsonb(c) from public.companies c where c.id = m.booked_by_company_id),
      'truck',             (select to_jsonb(tk) || jsonb_build_object('company', (select to_jsonb(c) from public.companies c where c.id = tk.company_id)) from public.trucks tk where tk.id = m.truck_id),
      'trailer',           (select to_jsonb(tr) from public.trailers tr where tr.id = m.trailer_id),
      'driver1',           (select to_jsonb(d) || jsonb_build_object('company', (select to_jsonb(c) from public.companies c where c.id = d.company_id)) from public.drivers d where d.id = m.driver1_id),
      'driver2',           (select to_jsonb(d) from public.drivers d where d.id = m.driver2_id),
      'original_driver1',  (select to_jsonb(d) from public.drivers d where d.id = m.original_driver1_id),
      'original_driver2',  (select to_jsonb(d) from public.drivers d where d.id = m.original_driver2_id),
      'original_truck',    (select to_jsonb(tk) from public.trucks tk where tk.id = m.original_truck_id),
      'original_trailer',  (select to_jsonb(tr) from public.trailers tr where tr.id = m.original_trailer_id)
    )
  ), '[]'::jsonb)
  from matched m;
$$;

grant execute on function public.search_orders_v2(text, text, uuid, uuid, uuid, int)
  to authenticated, service_role;
```

Notes:
- `security invoker` → existing RLS on `orders`, `drivers`, `trucks`, `brokers`, `companies`, `trailers`, `pickup_drops`, `order_files`, `order_transfers`, `recovery_history` all keep firing as today. No policy changes.
- The scope filter (`dispatcher`, `excluded_booked_by_company_id`, `booked_by_company_id`) is repeated in both CTEs; the real migration will factor it into a single helper CTE.
- All correlated subqueries use existing indexes (`order_id` btrees on related tables; PKs on entity tables).

## Client changes (`src/hooks/useOrdersSearch.ts`)

Replace stages 1–3 with a single call:

```ts
const { data, error } = await supabase.rpc("search_orders_v2", {
  p_term: term,
  p_booked_by: options?.bookedBy ?? null,
  p_dispatcher_user_id: options?.dispatcherUserId ?? null,
  p_excluded_booked_by_company_id: options?.excludeBookedByCompanyId ?? null,
  p_booked_by_company_id: options?.bookedByCompanyId ?? null,
  p_limit: 50,
});
if (error) throw error;
const transformed = transformOrders(data ?? []);
queryClient.setQueryData(newQueryKey, transformed);
```

Delete:
- `runScopedQuery` plus the two-pass logic (now in SQL).
- The dispatcher-driver lookup query.
- All four related-rows queries (`pickup_drops`, `order_files`, `order_transfers`, `recovery_history`).
- All five entity batch fetches plus the extra-companies fetch.
- `batchFetchMap`, `collectIds`, `groupByOrderId` helpers (no longer needed in this file).

Keep:
- Stale-response guard via `latestSearchKeyRef`.
- `queryClient.setQueryData(newQueryKey, transformed)` so real-time patching keeps working untouched — the row shape going into `transformOrders` is the same as today.
- The `useQuery({ enabled: false })` subscription pattern.

## Why this is faster
- 1 round-trip instead of 6–9 (saves ~5–8 × network latency, ~200–600ms depending on link).
- RLS is evaluated once per table at plan time inside the single statement instead of per HTTP request.
- Postgres can pipeline the correlated subqueries with index lookups it already does today — total DB work is roughly the same, but it's no longer gated on RTTs.
- Combined with the trigram indexes already shipped, a typical search drops to one indexed scan + a handful of PK lookups in one statement.

## Rollout
1. Ship migration creating `search_orders_v2` (+ GRANT EXECUTE).
2. Update `useOrdersSearch.ts` to call the RPC and strip the old enrichment code.
3. Smoke-test in preview: search by broker load #, internal load #, dispatcher-scoped search, and a term that hits the substring fallback path. Confirm row shape matches today (`order.broker?.name`, `order.driver1?.company?.name`, etc.).
4. Optional follow-up: if any callers rely on fields not in the RPC payload (e.g. transfer's broker), add them in a small SQL patch — not expected based on the current `ORDER_COLUMNS` list.

No frontend UX changes; the search input, debouncing, and results rendering all stay the same.

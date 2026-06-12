## Problem

The logs prove the search is bottlenecked entirely on the database:

```
search_orders_ids RPC:     6651 ms  ← THE problem
search_orders_hydrate RPC:  118 ms
transformOrders:              0 ms
setQueryData:                 1 ms
total:                     6770 ms
```

Same function executed server-side as superuser: **111 ms**. The 60× gap comes from RLS, not the query itself.

## Root cause

`public.search_orders_ids` is a `STABLE SECURITY INVOKER` SQL function. Postgres inlines it into the caller's statement, then layers all 3 SELECT policies on `orders` on top:

- `Roles can view all orders` — calls `has_any_role(...)` (STABLE SECURITY DEFINER)
- `Drivers can view own orders` — calls `has_role(...)` + `get_driver_id_for_user()`
- `Yard can view yard loads` — calls `has_role(...)` plus column checks

With OR'd policies the planner stops trusting the trigram bitmap path and falls back to a much heavier scan. EXPLAIN proves it: raw `ILIKE` query hits the trigram indexes in 0.5 ms (`shared hit=36`); the same logic wrapped in the function as service-role already balloons to 111 ms / `shared hit=34650`; with RLS layered on for a real user it becomes ~6.6 s.

The Reports filter is fast because it runs against an already-loaded in-memory array — it never hits Postgres per keystroke.

## Fix

Convert `search_orders_ids` to **`SECURITY DEFINER`** and enforce visibility inside the function body using the same role helpers, so the trigram index path is preserved and RLS isn't re-evaluated for every candidate row.

### New function shape

```sql
CREATE OR REPLACE FUNCTION public.search_orders_ids(
  p_term text,
  p_booked_by text DEFAULT NULL,
  p_dispatcher_user_id uuid DEFAULT NULL,
  p_excluded_booked_by_company_id uuid DEFAULT NULL,
  p_booked_by_company_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view_all boolean := public.has_any_role(
    ARRAY['dispatch','afterhours','manager','admin','accounting',
          'supervisor','safety','maintenance','chicago_management']::app_role[]
  );
  v_is_driver  boolean := public.has_role(v_uid, 'driver'::app_role);
  v_is_yard    boolean := public.has_role(v_uid, 'yard'::app_role);
  v_driver_id  uuid;
  v_result uuid[];
BEGIN
  -- No visibility at all → empty result
  IF NOT (v_can_view_all OR v_is_driver OR v_is_yard) THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  IF v_is_driver AND NOT v_can_view_all THEN
    v_driver_id := public.get_driver_id_for_user();
  END IF;

  SELECT COALESCE(array_agg(id ORDER BY created_at DESC), ARRAY[]::uuid[])
  INTO v_result
  FROM (
    SELECT o.id, o.created_at
    FROM public.orders o
    WHERE length(p_term) >= 3
      AND (
        o.broker_load_number  ILIKE '%' || p_term || '%'
        OR o.internal_load_number ILIKE '%' || p_term || '%'
      )
      -- Existing scope filters (dispatcher / company)
      AND (
        p_dispatcher_user_id IS NULL
        OR (p_booked_by IS NOT NULL AND o.booked_by = p_booked_by)
        OR o.driver1_id IN (
          SELECT id FROM public.drivers WHERE dispatcher_id = p_dispatcher_user_id
        )
      )
      AND (
        p_excluded_booked_by_company_id IS NULL
        OR o.booked_by_company_id IS NULL
        OR o.booked_by_company_id <> p_excluded_booked_by_company_id
      )
      AND (p_booked_by_company_id IS NULL OR o.booked_by_company_id = p_booked_by_company_id)
      -- Visibility enforced inline (replaces RLS for this call)
      AND (
        v_can_view_all
        OR (v_is_driver AND (o.driver1_id = v_driver_id OR o.driver2_id = v_driver_id))
        OR (v_is_yard AND o.driver1_id IS NULL AND o.truck_id IS NULL)
      )
    ORDER BY o.created_at DESC
    LIMIT p_limit
  ) m;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.search_orders_ids(text,text,uuid,uuid,uuid,int) FROM public;
GRANT EXECUTE ON FUNCTION public.search_orders_ids(text,text,uuid,uuid,uuid,int) TO authenticated;
```

Visibility rules are identical to today's RLS — no broader access. The only thing changing is *where* they're evaluated.

### Expected result

Search RPC drops from ~6650 ms to ~100–200 ms (matches what EXPLAIN shows under `service_role`). Hydrate is already 118 ms. End-to-end search target: **under ~400 ms**.

## Out of scope

- No frontend changes. The logs already added in `useOrdersSearch.ts` stay.
- `search_orders_hydrate` is untouched — it's already fast.
- RLS policies on `public.orders` stay exactly as they are; they still protect every other code path.

## Files

- New migration: redefine `public.search_orders_ids` (SECURITY DEFINER + inline visibility).

-- Restrict orders_materialized_view to authenticated users only
-- PostgreSQL doesn't support RLS on materialized views, so we revoke public access instead

-- Revoke all privileges from anon and authenticated roles on the materialized view
-- This removes it from the PostgREST API
REVOKE ALL ON public.orders_materialized_view FROM anon;
REVOKE ALL ON public.orders_materialized_view FROM authenticated;

-- Grant access only to postgres role (used by backend functions)
GRANT SELECT ON public.orders_materialized_view TO postgres;

-- Grant access to service_role for admin operations
GRANT ALL ON public.orders_materialized_view TO service_role;
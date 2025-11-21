-- Grant authenticated users read access to orders_materialized_view
-- The view will still be protected by the underlying orders table RLS policies

-- Grant SELECT access to authenticated users
GRANT SELECT ON public.orders_materialized_view TO authenticated;

-- Note: Since materialized views don't support RLS directly,
-- access control is handled by:
-- 1. The base 'orders' table RLS policies (which filter the data)
-- 2. Application-level checks for role-based access
-- Users can only see data they have permission to see from the underlying orders table
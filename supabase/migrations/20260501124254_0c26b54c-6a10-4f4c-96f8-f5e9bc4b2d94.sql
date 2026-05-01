CREATE OR REPLACE FUNCTION public.get_distinct_booked_by()
RETURNS TABLE(booked_by text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT booked_by
  FROM public.orders
  WHERE booked_by IS NOT NULL AND btrim(booked_by) <> ''
  ORDER BY booked_by;
$$;

GRANT EXECUTE ON FUNCTION public.get_distinct_booked_by() TO authenticated;
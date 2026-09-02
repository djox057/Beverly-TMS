CREATE OR REPLACE FUNCTION public.get_recovery_loads_badge()
RETURNS TABLE (total integer, has_mine boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH me AS (
    SELECT lower(btrim(p.full_name)) AS me_name
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.full_name IS NOT NULL
      AND btrim(p.full_name) <> ''
    LIMIT 1
  )
  SELECT
    count(*)::integer AS total,
    COALESCE(
      bool_or(
        lower(btrim(o.booked_by)) = (SELECT me_name FROM me)
      ),
      false
    ) AS has_mine
  FROM public.orders o
  WHERE o.retrieval = true
    AND o.canceled = false;
$$;

REVOKE ALL ON FUNCTION public.get_recovery_loads_badge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recovery_loads_badge() TO authenticated;
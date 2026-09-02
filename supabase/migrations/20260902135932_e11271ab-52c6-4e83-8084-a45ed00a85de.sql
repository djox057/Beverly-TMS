CREATE OR REPLACE FUNCTION public.tmp_verify_recovery_badge()
RETURNS TABLE (who text, rpc_total int, rpc_has_mine boolean, old_total int, old_has_mine boolean, matches boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE u record; r record; ot int; om boolean;
BEGIN
  FOR u IN
    SELECT p.user_id, p.full_name
    FROM public.profiles p
    WHERE p.full_name IS NOT NULL
    ORDER BY p.full_name
    LIMIT 3
  LOOP
    SELECT count(*)::int,
           COALESCE(bool_or(lower(btrim(o.booked_by)) = lower(btrim(u.full_name))), false)
      INTO ot, om
      FROM public.orders o
      WHERE o.retrieval = true AND o.canceled = false;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', u.user_id::text, 'role', 'authenticated')::text, true);

    SELECT b.total, b.has_mine INTO r FROM public.get_recovery_loads_badge() b;

    PERFORM set_config('request.jwt.claims', '', true);

    who := u.full_name; rpc_total := r.total; rpc_has_mine := r.has_mine;
    old_total := ot; old_has_mine := om;
    matches := (r.total = ot AND r.has_mine = om);
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.tmp_verify_recovery_badge() FROM PUBLIC;
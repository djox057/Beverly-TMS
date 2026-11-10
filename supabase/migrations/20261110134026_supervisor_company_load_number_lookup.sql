-- Only the aggregate lookup needs company-wide visibility. Order creation remains
-- SECURITY INVOKER, so supervisor team restrictions still apply to INSERT/SELECT.
CREATE OR REPLACE FUNCTION private.company_next_internal_load_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role'
     AND session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH candidate AS (
      SELECT (COALESCE(MAX((CASE
        WHEN p_company_id IN (SELECT id FROM public.companies WHERE name='Hart Freight Solutions LLC')
          AND internal_load_number ~ '^50000[0-9]+$'
          THEN substring(internal_load_number FROM 6)
        ELSE substring(internal_load_number FROM '^([0-9]+)')
      END)::numeric),0)+1)::text AS n
      FROM public.orders WHERE company_id=p_company_id
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM public.companies WHERE id=p_company_id AND name='Hart Freight Solutions LLC') THEN '50000'||n
      WHEN n ~ '^[0-9]{1,5}$'
        AND EXISTS (SELECT 1 FROM public.companies WHERE id=p_company_id AND name='United Enterprise Solutions INC') THEN '30'||n
      WHEN n ~ '^1[78][0-9]{3}$'
        AND EXISTS (SELECT 1 FROM public.companies WHERE id=p_company_id AND name='BF Prime LLC') THEN '20'||n
      WHEN n ~ '^1[78][0-9]{3}$'
        AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id=p_company_id AND name IN ('AP Silver Trans LLC','United Enterprise Solutions INC')) THEN '10'||n
      ELSE n
    END FROM candidate
  );
END;
$function$;
REVOKE ALL ON FUNCTION private.company_next_internal_load_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.company_next_internal_load_number(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_next_internal_load_number(p_company_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.company_next_internal_load_number(p_company_id);
$function$;
REVOKE ALL ON FUNCTION public.preview_next_internal_load_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_next_internal_load_number(uuid) TO authenticated, service_role;

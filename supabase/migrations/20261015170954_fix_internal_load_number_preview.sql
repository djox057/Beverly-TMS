CREATE OR REPLACE FUNCTION public.preview_next_internal_load_number(p_company_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT (COALESCE(MAX(substring(internal_load_number FROM '^([0-9]+)')::numeric), 0) + 1)::text
  FROM public.orders WHERE company_id = p_company_id;
$$;
REVOKE ALL ON FUNCTION public.preview_next_internal_load_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_next_internal_load_number(uuid) TO authenticated;

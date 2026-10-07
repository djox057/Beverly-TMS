-- The drug test table also links drivers and companies. Explicitly preserve the
-- existing companies(drivers) embedding as the driver's assigned company.
CREATE OR REPLACE FUNCTION public.companies(_driver public.drivers)
RETURNS SETOF public.companies
ROWS 1
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT company.*
  FROM public.companies AS company
  WHERE company.id = (_driver).company_id;
$$;

REVOKE ALL ON FUNCTION public.companies(public.drivers) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.companies(public.drivers) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.companies(public.drivers) IS
  'Preserves the assigned-company embedding for drivers without ambiguity from company drug test records. Uses caller permissions and company RLS.';

NOTIFY pgrst, 'reload schema';

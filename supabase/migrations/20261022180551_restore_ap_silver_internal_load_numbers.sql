LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.preview_next_internal_load_number(p_company_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH candidate AS (
    SELECT (COALESCE(MAX(substring(internal_load_number FROM '^([0-9]+)')::numeric), 0) + 1)::text AS n
    FROM public.orders WHERE company_id = p_company_id
  )
  SELECT CASE WHEN n ~ '^1[78][0-9]{3}$'
    AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id AND name = 'AP Silver Trans LLC')
    THEN '10' || n ELSE n END FROM candidate;
$$;

CREATE OR REPLACE FUNCTION private.normalize_internal_load_number()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.internal_load_number ~ '^1[78][0-9]{3}(-.+)?$'
    AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id = NEW.company_id AND name = 'AP Silver Trans LLC') THEN
    NEW.internal_load_number := '10' || NEW.internal_load_number;
  END IF;
  RETURN NEW;
END $$;

-- Restore only the AP Silver five-digit range changed by the October 15 migration.
-- Abort atomically if any restored number would collide within that company.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders a
    JOIN public.companies c ON c.id = a.company_id
    JOIN public.orders b ON b.company_id = a.company_id
      AND b.internal_load_number = substring(a.internal_load_number FROM 3) AND b.id <> a.id
    WHERE c.name = 'AP Silver Trans LLC'
      AND a.internal_load_number ~ '^101[78][0-9]{3}(-AP)?$'
  ) THEN
    RAISE EXCEPTION 'AP Silver load number restoration would create duplicates';
  END IF;
END $$;

UPDATE public.orders o
SET internal_load_number = substring(o.internal_load_number FROM 3)
FROM public.companies c
WHERE c.id = o.company_id AND c.name = 'AP Silver Trans LLC'
  AND o.internal_load_number ~ '^101[78][0-9]{3}(-AP)?$';

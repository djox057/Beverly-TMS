-- Serialize with order creation while renumbering historical records.
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.preview_next_internal_load_number(p_company_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH candidate AS (
    SELECT (COALESCE(MAX(substring(internal_load_number FROM '^([0-9]+)')::numeric), 0) + 1)::text AS n
    FROM public.orders WHERE company_id = p_company_id
  )
  SELECT CASE WHEN n ~ '^1[78][0-9]{3}$' THEN '10' || n ELSE n END FROM candidate;
$$;

-- Preserve all existing creation permissions, locking and idempotency behavior.
DO $$
DECLARE definition text; first_pos integer; last_pos integer;
BEGIN
  definition := pg_get_functiondef('public.create_order_with_unique_load_number(jsonb)'::regprocedure);
  first_pos := strpos(definition, '  SELECT COALESCE(MAX(');
  last_pos := strpos(definition, '  -- internal_load_number is unique per company');
  IF first_pos = 0 OR last_pos <= first_pos THEN
    RAISE EXCEPTION 'Unexpected order allocator definition';
  END IF;
  definition := left(definition, first_pos - 1)
    || '  next_load_number := public.preview_next_internal_load_number(company_uuid)::integer;' || E'\n\n'
    || substring(definition FROM last_pos);
  EXECUTE definition;
END $$;

-- Apply the same normalization to future direct inserts/imports and edits.
CREATE OR REPLACE FUNCTION private.normalize_internal_load_number()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.internal_load_number ~ '^1[78][0-9]{3}(-.+)?$' THEN
    NEW.internal_load_number := '10' || NEW.internal_load_number;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.normalize_internal_load_number() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER normalize_internal_load_number
BEFORE INSERT OR UPDATE OF internal_load_number ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.normalize_internal_load_number();

-- Exact five-digit match prevents touching numbers already beginning with 10.
UPDATE public.orders SET internal_load_number = '10' || internal_load_number
WHERE internal_load_number ~ '^1[78][0-9]{3}(-.+)?$';

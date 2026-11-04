DO $migration$
DECLARE
  definition text;
  anchor text := 'WHEN company_name_val ILIKE ''%lale transport%'' THEN ''LT''';
BEGIN
  SELECT pg_get_functiondef('public.create_order_with_unique_load_number(jsonb)'::regprocedure) INTO definition;
  IF position(anchor in definition) = 0 THEN
    RAISE EXCEPTION 'Company mapping anchor missing';
  END IF;
  IF position('THEN ''HT''' in definition) = 0 THEN
    definition := replace(definition, anchor,
      'WHEN company_name_val ILIKE ''%hart freight%'' THEN ''HT''
    WHEN company_name_val ILIKE ''%gd trucking%'' THEN ''GD''
    ' || anchor);
    EXECUTE definition;
  END IF;
END;
$migration$;

UPDATE public.orders o
SET load_company_code = CASE c.name
  WHEN 'Hart Freight Solutions LLC' THEN 'HT'
  WHEN 'GD Trucking Solutions LLC' THEN 'GD'
END
FROM public.companies c
WHERE o.company_id = c.id
  AND c.name IN ('Hart Freight Solutions LLC', 'GD Trucking Solutions LLC')
  AND NULLIF(trim(o.load_company_code), '') IS NULL;

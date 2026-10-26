
DO $restore$
DECLARE
  ap_company uuid;
  normal_max bigint;
  changed_count integer;
  actual_count integer;
  other_before text;
  other_after text;
BEGIN
  SELECT id INTO STRICT ap_company FROM public.companies WHERE name = 'AP Silver Trans LLC';
  PERFORM pg_advisory_xact_lock(hashtext('create_order_with_unique_load_number'), hashtext(ap_company::text));
  LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;

  IF strpos(pg_get_functiondef('private.normalize_internal_load_number()'::regprocedure), 'AP Silver Trans LLC') = 0
    OR strpos(pg_get_functiondef('public.preview_next_internal_load_number(uuid)'::regprocedure), 'AP Silver Trans LLC') = 0 THEN
    RAISE EXCEPTION 'AP Silver numbering exemption is missing';
  END IF;
  SELECT max(substring(internal_load_number FROM '^([0-9]+)')::bigint)
    INTO normal_max FROM public.orders
    WHERE company_id=ap_company AND internal_load_number !~ '^10[0-9]{5}(-.+)?$';
  IF normal_max <> 30776 THEN RAISE EXCEPTION 'Unexpected AP Silver baseline: %', normal_max; END IF;

  SELECT md5(string_agg(id::text || ':' || coalesce(internal_load_number,''), '|' ORDER BY id))
    INTO other_before FROM public.orders WHERE company_id IS DISTINCT FROM ap_company;

  CREATE TABLE private.ap_silver_number_restore_20261023 (
    order_id uuid PRIMARY KEY,
    company_id uuid NOT NULL,
    old_number text NOT NULL,
    new_number text NOT NULL UNIQUE,
    restored_at timestamptz NOT NULL DEFAULT now()
  );
  REVOKE ALL ON TABLE private.ap_silver_number_restore_20261023 FROM PUBLIC, anon, authenticated;
  ALTER TABLE private.ap_silver_number_restore_20261023 ENABLE ROW LEVEL SECURITY;

  INSERT INTO private.ap_silver_number_restore_20261023(order_id,company_id,old_number,new_number)
  SELECT id,company_id,internal_load_number,
    (normal_max + row_number() OVER (ORDER BY substring(internal_load_number FROM '^([0-9]+)')::bigint,id))::text
      || coalesce(substring(internal_load_number FROM '(-.+)$'),'')
  FROM public.orders WHERE company_id=ap_company AND internal_load_number ~ '^1019[0-9]{3}(-.+)?$'
    AND created_at >= '2026-10-15T17:27:34Z'::timestamptz;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count < 462 THEN RAISE EXCEPTION 'Unexpected affected count: %', changed_count; END IF;

  IF EXISTS (
    SELECT 1 FROM private.ap_silver_number_restore_20261023 m
    JOIN public.orders o ON o.company_id=ap_company
      AND substring(o.internal_load_number FROM '^([0-9]+)') = substring(m.new_number FROM '^([0-9]+)')
    WHERE o.id<>m.order_id
  ) THEN RAISE EXCEPTION 'Restored numbers would overlap existing AP Silver numbers'; END IF;

  UPDATE public.orders o SET internal_load_number=m.new_number
  FROM private.ap_silver_number_restore_20261023 m
  WHERE o.id=m.order_id AND o.company_id=m.company_id AND o.internal_load_number=m.old_number;
  GET DIAGNOSTICS actual_count = ROW_COUNT;
  IF actual_count <> changed_count THEN RAISE EXCEPTION 'Restore count mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE company_id=ap_company AND internal_load_number ~ '^10[0-9]{5}(-.+)?$')
    THEN RAISE EXCEPTION 'AP Silver prefixed numbers remain'; END IF;
  IF public.preview_next_internal_load_number(ap_company)::bigint <> normal_max+changed_count+1
    THEN RAISE EXCEPTION 'AP Silver next-number sequence is incorrect'; END IF;

  SELECT md5(string_agg(id::text || ':' || coalesce(internal_load_number,''), '|' ORDER BY id))
    INTO other_after FROM public.orders WHERE company_id IS DISTINCT FROM ap_company;
  IF other_before IS DISTINCT FROM other_after THEN RAISE EXCEPTION 'Another company numbering changed'; END IF;
END $restore$;

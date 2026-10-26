
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
DO $patch$
DECLARE definition text; needle text;
BEGIN
 SELECT pg_get_functiondef('public.create_order_with_unique_load_number(jsonb)'::regprocedure) INTO definition;
 needle := $old$  IF company_name_val = 'United Enterprise Solutions INC' AND full_load_number ~ '^1[789][0-9]{3}$' THEN
    full_load_number := full_load_number || 'A';
  END IF;$old$;
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'Unexpected create_order function'; END IF;
 EXECUTE replace(definition,needle,'');
 SELECT pg_get_functiondef('private.normalize_internal_load_number()'::regprocedure) INTO definition;
 needle := $old$     IF NEW.internal_load_number ~ '^1[789][0-9]{3}(-.+)?$' THEN
       NEW.internal_load_number := substring(NEW.internal_load_number FROM 1 FOR 5)||'A'||substring(NEW.internal_load_number FROM 6);
     END IF;$old$;
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'Unexpected normalize function'; END IF;
 definition := replace(definition,needle,$new$     NEW.internal_load_number := replace(NEW.internal_load_number,'A','');$new$);
 EXECUTE definition;
END $patch$;
UPDATE public.orders o SET internal_load_number=replace(o.internal_load_number,'A','')
FROM public.companies c WHERE c.id=o.company_id AND c.name='United Enterprise Solutions INC' AND o.internal_load_number LIKE '%A%';

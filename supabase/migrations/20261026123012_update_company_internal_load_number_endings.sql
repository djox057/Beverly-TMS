
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
CREATE OR REPLACE FUNCTION private.normalize_internal_load_number()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $fn$
DECLARE company_name text; format_only boolean := false;
BEGIN
 SELECT name INTO company_name FROM public.companies WHERE id=NEW.company_id;
 IF TG_OP='UPDATE' THEN
   format_only := NEW.company_id=OLD.company_id AND (
    (company_name='BF Prime United LLC' AND NEW.internal_load_number=regexp_replace(OLD.internal_load_number,'-BFU$','','i'))
    OR (company_name IN ('United Enterprise Solutions INC','BF Prime LLC') AND NEW.internal_load_number=OLD.internal_load_number||'-1'));
 END IF;
 IF NOT format_only THEN
   IF company_name='United Enterprise Solutions INC' THEN
     IF NEW.internal_load_number ~ '^101[789][0-9]{3}(-.+)?$' THEN
       NEW.internal_load_number := substring(NEW.internal_load_number FROM 3);
     END IF;
     IF NEW.internal_load_number ~ '^1[789][0-9]{3}(-.+)?$' THEN
       NEW.internal_load_number := substring(NEW.internal_load_number FROM 1 FOR 5)||'A'||substring(NEW.internal_load_number FROM 6);
     END IF;
   ELSIF NEW.internal_load_number ~ '^1[78][0-9]{3}(-.+)?$' AND company_name IS DISTINCT FROM 'AP Silver Trans LLC' THEN
     NEW.internal_load_number := '10'||NEW.internal_load_number;
   END IF;
 END IF;
 IF company_name='BF Prime United LLC' THEN
   NEW.internal_load_number := regexp_replace(NEW.internal_load_number,'-BFU$','','i');
 ELSIF company_name IN ('United Enterprise Solutions INC','BF Prime LLC')
   AND coalesce(NEW.internal_load_number,'')<>'' AND NEW.internal_load_number NOT LIKE '%-1' THEN
   NEW.internal_load_number := NEW.internal_load_number||'-1';
 END IF;
 RETURN NEW;
END $fn$;

DO $patch$
DECLARE definition text; needle text := '  BEGIN
    INSERT INTO orders (';
BEGIN
 SELECT pg_get_functiondef('public.create_order_with_unique_load_number(jsonb)'::regprocedure) INTO definition;
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'Unexpected create_order function'; END IF;
 definition := replace(definition,needle,$replacement$  IF company_name_val IN ('United Enterprise Solutions INC','BF Prime LLC') THEN
    full_load_number := full_load_number || '-1';
  END IF;

  BEGIN
    INSERT INTO orders ($replacement$);
 EXECUTE definition;
END $patch$;

UPDATE public.orders o SET internal_load_number=regexp_replace(o.internal_load_number,'-BFU$','','i')
FROM public.companies c WHERE o.company_id=c.id AND c.name='BF Prime United LLC' AND o.internal_load_number ~* '-BFU$';
UPDATE public.orders o SET internal_load_number=o.internal_load_number||'-1'
FROM public.companies c WHERE o.company_id=c.id AND c.name IN ('United Enterprise Solutions INC','BF Prime LLC')
AND coalesce(o.internal_load_number,'')<>'' AND o.internal_load_number NOT LIKE '%-1';

-- Preserve the company code when removing the embedded BFU suffix.
UPDATE public.orders o SET load_company_code='BFU'
FROM public.companies c WHERE c.id=o.company_id AND c.name='BF Prime United LLC'
AND coalesce(o.load_company_code,'')='';

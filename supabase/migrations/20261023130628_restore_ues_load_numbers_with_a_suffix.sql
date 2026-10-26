
DO $lock$
DECLARE cid uuid;
BEGIN
 SELECT id INTO STRICT cid FROM public.companies WHERE name='United Enterprise Solutions INC';
 PERFORM pg_advisory_xact_lock(hashtext('create_order_with_unique_load_number'),hashtext(cid::text));
END $lock$;
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE private.ues_number_restore_20261023 (
 order_id uuid PRIMARY KEY, company_id uuid NOT NULL, old_number text NOT NULL, new_number text NOT NULL UNIQUE,
 restored_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.ues_number_restore_20261023 FROM PUBLIC,anon,authenticated;
ALTER TABLE private.ues_number_restore_20261023 ENABLE ROW LEVEL SECURITY;

CREATE TEMP TABLE ues_other_numbering_before ON COMMIT DROP AS
 SELECT c.id,c.name,public.preview_next_internal_load_number(c.id) AS next_number
 FROM public.companies c WHERE c.name<>'United Enterprise Solutions INC';

INSERT INTO private.ues_number_restore_20261023(order_id,company_id,old_number,new_number)
 SELECT o.id,o.company_id,o.internal_load_number,
   regexp_replace(substring(o.internal_load_number FROM 3),'^([0-9]+)',E'\\1A')
 FROM public.orders o JOIN public.companies c ON c.id=o.company_id
 WHERE c.name='United Enterprise Solutions INC' AND o.internal_load_number ~ '^101[789][0-9]{3}(-.+)?$';

DO $check$
BEGIN
 IF (SELECT count(*) FROM private.ues_number_restore_20261023)<1569 THEN
   RAISE EXCEPTION 'Unexpected UES affected count';
 END IF;
 IF EXISTS (
   SELECT 1 FROM private.ues_number_restore_20261023 m JOIN public.orders o
     ON o.company_id=m.company_id AND o.internal_load_number=m.new_number AND o.id<>m.order_id
 ) THEN RAISE EXCEPTION 'UES restored numbers collide'; END IF;
END $check$;

CREATE OR REPLACE FUNCTION public.preview_next_internal_load_number(p_company_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 WITH candidate AS (
   SELECT (COALESCE(MAX(substring(internal_load_number FROM '^([0-9]+)')::numeric),0)+1)::text AS n
   FROM public.orders WHERE company_id=p_company_id
 )
 SELECT CASE WHEN n ~ '^1[78][0-9]{3}$'
   AND NOT EXISTS (
     SELECT 1 FROM public.companies WHERE id=p_company_id
       AND name IN ('AP Silver Trans LLC','United Enterprise Solutions INC')
   ) THEN '10'||n ELSE n END FROM candidate;
$function$;

CREATE OR REPLACE FUNCTION private.normalize_internal_load_number()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
BEGIN
 IF EXISTS (SELECT 1 FROM public.companies WHERE id=NEW.company_id AND name='United Enterprise Solutions INC') THEN
   IF NEW.internal_load_number ~ '^101[789][0-9]{3}(-.+)?$' THEN
     NEW.internal_load_number := substring(NEW.internal_load_number FROM 3);
   END IF;
   IF NEW.internal_load_number ~ '^1[789][0-9]{3}(-.+)?$' THEN
     NEW.internal_load_number := regexp_replace(NEW.internal_load_number,'^([0-9]+)',E'\\1A');
   END IF;
 ELSIF NEW.internal_load_number ~ '^1[78][0-9]{3}(-.+)?$'
   AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id=NEW.company_id AND name='AP Silver Trans LLC') THEN
   NEW.internal_load_number := '10'||NEW.internal_load_number;
 END IF;
 RETURN NEW;
END $function$;

-- Keep RPC allocation, locking, permissions and idempotency intact, and return
-- the same A-suffixed internal number that the normalization trigger stores.
DO $patch$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.create_order_with_unique_load_number(jsonb)'::regprocedure);
 IF strpos(definition,'  full_load_number := next_load_number::text;')=0 THEN
   RAISE EXCEPTION 'Unexpected order creation function';
 END IF;
 definition:=replace(definition,'  full_load_number := next_load_number::text;',
   '  full_load_number := next_load_number::text;'||E'\n'||
   '  IF company_name_val = ''United Enterprise Solutions INC'' AND full_load_number ~ ''^1[789][0-9]{3}$'' THEN'||E'\n'||
   '    full_load_number := full_load_number || ''A'';'||E'\n'||
   '  END IF;');
 EXECUTE definition;
END $patch$;

DO $restore$
DECLARE affected integer; expected integer;
BEGIN
 SELECT count(*) INTO expected FROM private.ues_number_restore_20261023;
 UPDATE public.orders o SET internal_load_number=m.new_number
 FROM private.ues_number_restore_20261023 m
 WHERE o.id=m.order_id AND o.company_id=m.company_id AND o.internal_load_number=m.old_number;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>expected THEN RAISE EXCEPTION 'UES restore count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM private.ues_number_restore_20261023 m JOIN public.orders o ON o.id=m.order_id WHERE o.internal_load_number<>m.new_number)
   THEN RAISE EXCEPTION 'UES restored value mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM public.orders o JOIN public.companies c ON c.id=o.company_id
   WHERE c.name='United Enterprise Solutions INC' AND o.internal_load_number ~ '^101[789][0-9]{3}(-.+)?$')
   THEN RAISE EXCEPTION 'UES prefixed numbers remain'; END IF;
 IF EXISTS (SELECT 1 FROM ues_other_numbering_before b WHERE b.next_number IS DISTINCT FROM public.preview_next_internal_load_number(b.id))
   THEN RAISE EXCEPTION 'Another company numbering changed'; END IF;
END $restore$;

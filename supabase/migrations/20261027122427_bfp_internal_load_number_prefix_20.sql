-- BFP only: replace the added 10 prefix with 20, preserving -1 and company codes.
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
DO $lock$
DECLARE cid uuid;
BEGIN
 SELECT id INTO STRICT cid FROM public.companies WHERE name='BF Prime LLC';
 PERFORM pg_advisory_xact_lock(hashtext('create_order_with_unique_load_number'),hashtext(cid::text));
END $lock$;
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE bfp_other_numbers_before ON COMMIT DROP AS
 SELECT c.id, public.preview_next_internal_load_number(c.id) AS next_number,
 (SELECT md5(string_agg(o.id::text||':'||coalesce(o.internal_load_number,'')||':'||coalesce(o.load_company_code,''),'|' ORDER BY o.id)) FROM public.orders o WHERE o.company_id=c.id) AS checksum
 FROM public.companies c WHERE c.name<>'BF Prime LLC';

CREATE TABLE private.bfp_prefix_20_restore_20261027 (
 order_id uuid PRIMARY KEY,
 company_id uuid NOT NULL,
 old_number text NOT NULL,
 new_number text NOT NULL,
 other_fields_checksum text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.bfp_prefix_20_restore_20261027 FROM PUBLIC,anon,authenticated;
ALTER TABLE private.bfp_prefix_20_restore_20261027 ENABLE ROW LEVEL SECURITY;

INSERT INTO private.bfp_prefix_20_restore_20261027(order_id,company_id,old_number,new_number,other_fields_checksum)
 SELECT o.id,o.company_id,o.internal_load_number,'20'||substring(o.internal_load_number FROM 3),
 md5((to_jsonb(o)-'internal_load_number'-'updated_at')::text)
 FROM public.orders o JOIN public.companies c ON c.id=o.company_id
 WHERE c.name='BF Prime LLC' AND o.internal_load_number ~ '^101[78][0-9]{3}(-.+)?$';

DO $check$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM private.bfp_prefix_20_restore_20261027) THEN
   RAISE EXCEPTION 'No BFP numbers matched';
 END IF;
 IF EXISTS (SELECT 1 FROM private.bfp_prefix_20_restore_20261027 m JOIN public.orders o ON o.company_id=m.company_id AND o.internal_load_number=m.new_number AND o.id<>m.order_id)
 THEN RAISE EXCEPTION 'BFP converted numbers collide'; END IF;
END $check$;

CREATE OR REPLACE FUNCTION private.normalize_internal_load_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE company_name text; format_only boolean := false;
BEGIN
 SELECT name INTO company_name FROM public.companies WHERE id=NEW.company_id;
 IF TG_OP='UPDATE' THEN
   format_only := NEW.company_id=OLD.company_id AND (
    (company_name='BF Prime United LLC' AND NEW.internal_load_number=regexp_replace(OLD.internal_load_number,'-BFU$','','i'))
    OR (company_name IN ('United Enterprise Solutions INC','BF Prime LLC') AND NEW.internal_load_number=OLD.internal_load_number||'-1'));
 END IF;
 IF NOT format_only THEN
   IF company_name='BF Prime LLC' THEN
     IF NEW.internal_load_number ~ '^101[78][0-9]{3}(-.+)?$' THEN
       NEW.internal_load_number := '20'||substring(NEW.internal_load_number FROM 3);
     ELSIF NEW.internal_load_number ~ '^1[78][0-9]{3}(-.+)?$' THEN
       NEW.internal_load_number := '20'||NEW.internal_load_number;
     END IF;
   ELSIF company_name='United Enterprise Solutions INC' THEN
     IF NEW.internal_load_number ~ '^101[789][0-9]{3}(-.+)?$' THEN
       NEW.internal_load_number := substring(NEW.internal_load_number FROM 3);
     END IF;
     NEW.internal_load_number := replace(NEW.internal_load_number,'A','');
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
END $function$;
CREATE OR REPLACE FUNCTION public.preview_next_internal_load_number(p_company_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 WITH candidate AS (
   SELECT (COALESCE(MAX(substring(internal_load_number FROM '^([0-9]+)')::numeric),0)+1)::text AS n
   FROM public.orders WHERE company_id=p_company_id
 )
 SELECT CASE
   WHEN n ~ '^1[78][0-9]{3}$'
     AND EXISTS (SELECT 1 FROM public.companies WHERE id=p_company_id AND name='BF Prime LLC')
     THEN '20'||n
   WHEN n ~ '^1[78][0-9]{3}$'
   AND NOT EXISTS (
     SELECT 1 FROM public.companies WHERE id=p_company_id
       AND name IN ('AP Silver Trans LLC','United Enterprise Solutions INC')
   ) THEN '10'||n ELSE n END FROM candidate;
$function$;

UPDATE public.orders o SET internal_load_number=m.new_number
 FROM private.bfp_prefix_20_restore_20261027 m
 WHERE o.id=m.order_id AND o.company_id=m.company_id AND o.internal_load_number=m.old_number;

-- Exercise the actual normalization trigger on temporary rows; no real loads are created.
CREATE TEMP TABLE bfp_number_cases(company_id uuid, internal_load_number text, expected text) ON COMMIT DROP;
CREATE TRIGGER normalize_test BEFORE INSERT OR UPDATE OF internal_load_number ON bfp_number_cases
 FOR EACH ROW EXECUTE FUNCTION private.normalize_internal_load_number();
INSERT INTO bfp_number_cases
 SELECT c.id,v.input,v.expected FROM (VALUES
 ('BF Prime LLC','17001','2017001-1'),
 ('BF Prime LLC','18001','2018001-1'),
 ('BF Prime LLC','1018990-1','2018990-1'),
 ('BF Prime LLC','2018991-1','2018991-1'),
 ('BF Prime LLC','19001','19001-1'),
 ('BF Prime LLC','16001','16001-1'),
 ('United Enterprise Solutions INC','1018001','18001-1'),
 ('United Enterprise Solutions INC','18001A','18001-1'),
 ('AP Silver Trans LLC','18001','18001'),
 ('Beverly Freight Inc','18001','1018001'),
 ('BF Prime United LLC','13001-BFU','13001')
 ) AS v(company,input,expected) JOIN public.companies c ON c.name=v.company;

DO $verify$
DECLARE cid uuid; expected_next text;
BEGIN
 IF (SELECT count(*) FROM bfp_number_cases)<>11 OR EXISTS (SELECT 1 FROM bfp_number_cases WHERE internal_load_number<>expected)
 THEN RAISE EXCEPTION 'Number normalization regression'; END IF;
 IF EXISTS (SELECT 1 FROM private.bfp_prefix_20_restore_20261027 m JOIN public.orders o ON o.id=m.order_id
 WHERE o.internal_load_number<>m.new_number OR md5((to_jsonb(o)-'internal_load_number'-'updated_at')::text)<>m.other_fields_checksum)
 THEN RAISE EXCEPTION 'BFP backfill mismatch or unrelated order fields changed'; END IF;
 IF EXISTS (SELECT 1 FROM bfp_other_numbers_before b WHERE b.next_number IS DISTINCT FROM public.preview_next_internal_load_number(b.id)
 OR b.checksum IS DISTINCT FROM (SELECT md5(string_agg(o.id::text||':'||coalesce(o.internal_load_number,'')||':'||coalesce(o.load_company_code,''),'|' ORDER BY o.id)) FROM public.orders o WHERE o.company_id=b.id))
 THEN RAISE EXCEPTION 'Other company numbering changed'; END IF;
 SELECT id INTO STRICT cid FROM public.companies WHERE name='BF Prime LLC';
 IF EXISTS (SELECT 1 FROM public.orders WHERE company_id=cid AND internal_load_number ~ '^101[78][0-9]{3}(-.+)?$')
 THEN RAISE EXCEPTION 'Old BFP prefixes remain'; END IF;
 SELECT ((max(substring(new_number FROM '^([0-9]+)')::numeric))+1)::text INTO expected_next FROM private.bfp_prefix_20_restore_20261027;
 IF public.preview_next_internal_load_number(cid)<>expected_next
 THEN RAISE EXCEPTION 'BFP next number incorrect'; END IF;
END $verify$;

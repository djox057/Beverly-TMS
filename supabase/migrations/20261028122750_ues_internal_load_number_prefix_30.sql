-- Add 30 to all existing UES numbers and continue the prefixed sequence.
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
DO $lock$ DECLARE cid uuid; BEGIN
 SELECT id INTO STRICT cid FROM public.companies WHERE name='United Enterprise Solutions INC';
 PERFORM pg_advisory_xact_lock(hashtext('create_order_with_unique_load_number'),hashtext(cid::text));
END $lock$;
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE ues_others_before ON COMMIT DROP AS
 SELECT c.id, public.preview_next_internal_load_number(c.id) AS next_number,
 (SELECT md5(string_agg(o.id::text||':'||coalesce(o.internal_load_number,'')||':'||coalesce(o.load_company_code,''),'|' ORDER BY o.id)) FROM public.orders o WHERE o.company_id=c.id) AS checksum
 FROM public.companies c WHERE c.name<>'United Enterprise Solutions INC';

CREATE TABLE private.ues_prefix_30_restore_20261028(
 order_id uuid PRIMARY KEY,company_id uuid NOT NULL,old_number text NOT NULL,new_number text NOT NULL,
 other_fields_checksum text NOT NULL,changed_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON TABLE private.ues_prefix_30_restore_20261028 FROM PUBLIC,anon,authenticated;
ALTER TABLE private.ues_prefix_30_restore_20261028 ENABLE ROW LEVEL SECURITY;
INSERT INTO private.ues_prefix_30_restore_20261028
 SELECT o.id,o.company_id,o.internal_load_number,'30'||o.internal_load_number,
 md5((to_jsonb(o)-'internal_load_number'-'updated_at')::text),now()
 FROM public.orders o JOIN public.companies c ON c.id=o.company_id WHERE c.name='United Enterprise Solutions INC';
DO $check$ BEGIN
 IF EXISTS(SELECT 1 FROM private.ues_prefix_30_restore_20261028 WHERE old_number !~ '^[0-9]{1,5}(-.+)?$')
 THEN RAISE EXCEPTION 'Unexpected UES format'; END IF;
 -- The complete old set is mapped injectively; also reject target overlaps before updates.
 IF EXISTS(SELECT 1 FROM private.ues_prefix_30_restore_20261028 m JOIN public.orders o ON o.company_id=m.company_id AND o.internal_load_number=m.new_number AND o.id<>m.order_id)
 THEN RAISE EXCEPTION 'Target numbers overlap existing UES numbers'; END IF;
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
 IF TG_OP='UPDATE' AND company_name='United Enterprise Solutions INC' THEN
   format_only := format_only OR NEW.internal_load_number=OLD.internal_load_number
     OR NEW.internal_load_number='30'||OLD.internal_load_number;
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
     IF NEW.internal_load_number ~ '^[0-9]{1,5}(-.+)?$' THEN
       NEW.internal_load_number := '30'||NEW.internal_load_number;
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
   WHEN n ~ '^[0-9]{1,5}$'
     AND EXISTS (SELECT 1 FROM public.companies WHERE id=p_company_id AND name='United Enterprise Solutions INC')
     THEN '30'||n
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
 FROM private.ues_prefix_30_restore_20261028 m WHERE o.id=m.order_id AND o.internal_load_number=m.old_number;

CREATE TEMP TABLE ues_cases(company_id uuid,internal_load_number text,expected text) ON COMMIT DROP;
CREATE TRIGGER normalize_test BEFORE INSERT OR UPDATE OF internal_load_number ON ues_cases FOR EACH ROW EXECUTE FUNCTION private.normalize_internal_load_number();
INSERT INTO ues_cases SELECT c.id,v.input,v.expected FROM (VALUES
 ('United Enterprise Solutions INC','18745-1','3018745-1'),
 ('United Enterprise Solutions INC','3018746-1','3018746-1'),
 ('United Enterprise Solutions INC','18001A','3018001-1'),
 ('BF Prime LLC','18001','2018001-1'),
 ('AP Silver Trans LLC','18001','18001'),
 ('Beverly Freight Inc','18001','1018001')
 ) v(company,input,expected) JOIN public.companies c ON c.name=v.company;
DO $verify$ DECLARE cid uuid; expected_next text; BEGIN
 IF (SELECT count(*) FROM ues_cases)<>6 OR EXISTS(SELECT 1 FROM ues_cases WHERE internal_load_number<>expected)
 THEN RAISE EXCEPTION 'Normalization regression'; END IF;
 IF EXISTS(SELECT 1 FROM private.ues_prefix_30_restore_20261028 m JOIN public.orders o ON o.id=m.order_id
 WHERE o.internal_load_number<>m.new_number OR md5((to_jsonb(o)-'internal_load_number'-'updated_at')::text)<>m.other_fields_checksum)
 THEN RAISE EXCEPTION 'Backfill mismatch or other order fields changed'; END IF;
 IF EXISTS(SELECT 1 FROM ues_others_before b WHERE b.next_number IS DISTINCT FROM public.preview_next_internal_load_number(b.id)
 OR b.checksum IS DISTINCT FROM (SELECT md5(string_agg(o.id::text||':'||coalesce(o.internal_load_number,'')||':'||coalesce(o.load_company_code,''),'|' ORDER BY o.id)) FROM public.orders o WHERE o.company_id=b.id))
 THEN RAISE EXCEPTION 'Other company changed'; END IF;
 SELECT id INTO STRICT cid FROM public.companies WHERE name='United Enterprise Solutions INC';
 SELECT (max(substring(new_number FROM '^([0-9]+)')::numeric)+1)::text INTO expected_next FROM private.ues_prefix_30_restore_20261028;
 IF public.preview_next_internal_load_number(cid)<>expected_next THEN RAISE EXCEPTION 'Wrong next number'; END IF;
END $verify$;

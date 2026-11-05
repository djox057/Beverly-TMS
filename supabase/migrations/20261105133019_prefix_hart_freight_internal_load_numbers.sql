-- Prefix existing and future Hart Freight internal load numbers; preserve other company rules.
DO $migration$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef('public.preview_next_internal_load_number(uuid)'::regprocedure) INTO def;
 IF position('SELECT (COALESCE(MAX(substring(internal_load_number' in def)=0 THEN RAISE EXCEPTION 'Unexpected preview definition'; END IF;
 def := replace(def,
 'MAX(substring(internal_load_number FROM ''^([0-9]+)'')::numeric)',
 'MAX((CASE WHEN p_company_id IN (SELECT id FROM public.companies WHERE name=''Hart Freight Solutions LLC'') AND internal_load_number ~ ''^50000[0-9]+$'' THEN substring(internal_load_number FROM 6) ELSE substring(internal_load_number FROM ''^([0-9]+)'') END)::numeric)');
 def := replace(def,'SELECT CASE','SELECT CASE
   WHEN EXISTS (SELECT 1 FROM public.companies WHERE id=p_company_id AND name=''Hart Freight Solutions LLC'') THEN ''50000''||n');
 EXECUTE def;
 SELECT pg_get_functiondef('private.normalize_internal_load_number()'::regprocedure) INTO def;
 IF position('IF company_name=''BF Prime LLC'' THEN' in def)=0 THEN RAISE EXCEPTION 'Unexpected normalizer definition'; END IF;
 def := replace(def,'IF company_name=''BF Prime LLC'' THEN',
 'IF company_name=''Hart Freight Solutions LLC'' THEN
     IF coalesce(NEW.internal_load_number,'''')<>'''' AND NEW.internal_load_number !~ ''^50000[0-9]+$'' THEN
       NEW.internal_load_number := ''50000''||NEW.internal_load_number;
     END IF;
   ELSIF company_name=''BF Prime LLC'' THEN');
 EXECUTE def;
 SELECT pg_get_functiondef('public.create_order_with_unique_load_number(jsonb)'::regprocedure) INTO def;
 def := replace(def,'next_load_number integer;','next_load_number bigint;');
 def := replace(def,'preview_next_internal_load_number(company_uuid)::integer','preview_next_internal_load_number(company_uuid)::bigint');
 EXECUTE def;
END $migration$;
UPDATE public.orders SET internal_load_number='50000'||internal_load_number
WHERE company_id IN (SELECT id FROM public.companies WHERE name='Hart Freight Solutions LLC')
AND internal_load_number ~ '^[0-9]+$' AND internal_load_number !~ '^50000[0-9]+$';

-- The pure calculator mirrors buildServiceEntries/serviceSummary, including local overrides.
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.pm_endpoint_edited(extra jsonb, original jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
 SELECT extra IS NOT NULL AND (coalesce((extra->>'is_deleted')::boolean,false)
  OR extra->>'entry_type' IS DISTINCT FROM 'Mileage Check'
  OR (extra->>'odometer')::numeric IS DISTINCT FROM (original->>'new_value')::numeric
  OR extra->>'log_date' IS DISTINCT FROM left(original->>'changed_at',10));
$$;
CREATE OR REPLACE FUNCTION private.pm_readiness_value(t jsonb, history jsonb, saved jsonb, today text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE
 overrides jsonb; h jsonb[]; omitted text[] := '{}'; automatic jsonb := '[]'; entries jsonb := '[]';
 e jsonb; extra jsonb; prev jsonb; partial jsonb; corrected jsonb; cur jsonb; nxt jsonb;
 i integer; j integer; k integer; n integer; elapsed numeric; edited boolean;
 baseline_miles numeric; final_miles numeric; m numeric; p numeric; c numeric;
 live_oil_key text; live_miles_key text; source text := upper(btrim(coalesce(t->>'source','')));
 oil_dated jsonb; oil_undated jsonb; oil jsonb; baseline jsonb; reading jsonb; linked jsonb;
 current_miles numeric; oil_miles numeric; oil_date text; since_oil numeric; due_miles numeric; yellow numeric;
BEGIN
 SELECT coalesce(jsonb_object_agg(value->>'source_key', value),'{}') INTO overrides FROM jsonb_array_elements(saved) WHERE value->>'source_key' IS NOT NULL;
 SELECT coalesce(array_agg(value ORDER BY (value->>'changed_at')::timestamptz,value->>'id'),'{}'::jsonb[]) INTO h
 FROM jsonb_array_elements(history) WHERE value->>'field'='miles' AND value->>'new_value' IS NOT NULL;
 n := coalesce(array_length(h,1),0);
 IF n >= 3 THEN
  FOR i IN 2..n-1 LOOP
   prev:=h[i-1]; partial:=h[i]; corrected:=h[i+1];
   IF partial->>'old_value' IS NOT NULL AND corrected->>'old_value' IS NOT NULL THEN CONTINUE; END IF;
   p:=(prev->>'new_value')::numeric; m:=(partial->>'new_value')::numeric; c:=(corrected->>'new_value')::numeric;
   elapsed:=extract(epoch FROM ((corrected->>'changed_at')::timestamptz-(partial->>'changed_at')::timestamptz));
   edited:=private.pm_endpoint_edited(overrides->('history:'||(prev->>'id')),prev) OR private.pm_endpoint_edited(overrides->('history:'||(corrected->>'id')),corrected);
   IF m>0 AND m<p AND c>=p AND c>=m*10 AND left(c::text,length(m::text))=m::text
    AND coalesce(partial->>'changed_by','')<>'' AND partial->>'changed_by'=corrected->>'changed_by'
    AND left(partial->>'changed_at',10)=left(corrected->>'changed_at',10) AND elapsed BETWEEN 0 AND 60
    AND NOT overrides ? ('history:'||(partial->>'id')) AND NOT edited THEN omitted:=array_append(omitted,partial->>'id'); END IF;
  END LOOP;
 END IF;
 i:=1;
 WHILE i<=n LOOP
  j:=i;
  WHILE j<n LOOP
   cur:=h[j]; nxt:=h[j+1]; elapsed:=extract(epoch FROM ((nxt->>'changed_at')::timestamptz-(h[i]->>'changed_at')::timestamptz));
   EXIT WHEN coalesce(h[i]->>'changed_by','')='' OR nxt->>'changed_by' IS DISTINCT FROM h[i]->>'changed_by'
    OR left(nxt->>'changed_at',10)<>left(h[i]->>'changed_at',10) OR elapsed<0 OR elapsed>60
    OR nxt->>'old_value' IS NULL OR (nxt->>'old_value')::numeric<>(cur->>'new_value')::numeric;
   j:=j+1;
  END LOOP;
  corrected:=h[j]; baseline_miles:=(h[i]->>'old_value')::numeric; final_miles:=(corrected->>'new_value')::numeric;
  edited:=private.pm_endpoint_edited(overrides->('history:'||(corrected->>'id')),corrected);
  IF i>1 THEN edited:=edited OR private.pm_endpoint_edited(overrides->('history:'||(h[i-1]->>'id')),h[i-1]); END IF;
  IF j>i AND baseline_miles>=0 AND final_miles>=baseline_miles AND NOT edited THEN
   FOR k IN i..j-1 LOOP
    m:=(h[k]->>'new_value')::numeric;
    IF (m<baseline_miles OR m>final_miles) AND NOT overrides ? ('history:'||(h[k]->>'id')) THEN omitted:=array_append(omitted,h[k]->>'id'); END IF;
   END LOOP;
  END IF;
  i:=j+1;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(history) WHERE value->>'new_value' IS NOT NULL AND value->>'field' IN ('miles','air_filter') LOOP
  IF e->>'field'='miles' AND e->>'id'=ANY(omitted) THEN CONTINUE; END IF;
  automatic:=automatic||jsonb_build_array(jsonb_build_object('id','history:'||(e->>'id'),'source_key','history:'||(e->>'id'),
   'log_date',left(e->>'changed_at',10),'entry_type',CASE WHEN e->>'field'='miles' THEN 'Mileage Check' ELSE 'Air Filter' END,
   'odometer',(e->>'new_value')::numeric,'created_at',e->>'changed_at','original_odometer',e->'new_value',
   'current_reading',e->>'field'='miles' AND e->'new_value'=t->'miles' AND e->>'changed_at'=t->>'miles_updated_at'));
 END LOOP;
 IF t->>'start_miles' IS NOT NULL OR coalesce(t->>'baseline_start_date','')<>'' OR coalesce(t->>'baseline_note','')<>'' THEN
  automatic:=automatic||jsonb_build_array(jsonb_build_object('id','truck:baseline','source_key','truck:baseline','log_date',t->>'baseline_start_date',
   'entry_type','Baseline Start','odometer',t->'start_miles','notes',t->>'baseline_note','created_at',''));
 END IF;
 live_miles_key:='live:mileage:'||coalesce(t->>'miles_updated_at','undated')||':'||(t->>'miles');
 IF t->>'miles' IS NOT NULL AND NOT EXISTS(SELECT FROM jsonb_array_elements(automatic) a WHERE a->>'entry_type'='Mileage Check' AND a->'odometer'=t->'miles' AND a->>'log_date'=left(t->>'miles_updated_at',10)) THEN
  automatic:=automatic||jsonb_build_array(jsonb_build_object('id',live_miles_key,'source_key',live_miles_key,'log_date',left(t->>'miles_updated_at',10),
   'entry_type','Mileage Check','odometer',t->'miles','created_at',coalesce(t->>'miles_updated_at',''),'current_reading',true,'original_odometer',t->'miles'));
 END IF;
 live_oil_key:='live:oil:'||coalesce(t->>'oil_change_date','undated')||':'||coalesce(t->>'last_oil_change_miles','null');
 IF t->>'last_oil_change_miles' IS NOT NULL OR t->>'oil_change_date' IS NOT NULL THEN
  automatic:=automatic||jsonb_build_array(jsonb_build_object('id',live_oil_key,'source_key',live_oil_key,'log_date',t->>'oil_change_date',
   'entry_type','Oil Change','odometer',t->'last_oil_change_miles','created_at',''));
 END IF;
 IF t->>'air_filter' IS NOT NULL AND NOT EXISTS(SELECT FROM jsonb_array_elements(history) a WHERE a->>'field'='air_filter' AND (a->>'new_value')::numeric=(t->>'air_filter')::numeric) THEN
  automatic:=automatic||jsonb_build_array(jsonb_build_object('id','live:filter:'||(t->>'air_filter'),'source_key','live:filter:'||(t->>'air_filter'),
   'log_date',null,'entry_type','Air Filter','odometer',t->'air_filter','created_at',''));
 END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(automatic) LOOP
  extra:=overrides->(e->>'source_key');
  IF extra IS NOT NULL THEN
   IF e->>'source_key'='truck:baseline' THEN extra:=(extra-'odometer'-'log_date'-'notes'-'entry_type'); END IF;
   e:=e||extra;
  END IF;
  IF NOT coalesce((e->>'is_deleted')::boolean,false) THEN entries:=entries||jsonb_build_array(e); END IF;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(saved) s WHERE NOT coalesce((s->>'is_deleted')::boolean,false)
  AND (s->>'source_key' IS NULL OR NOT EXISTS(SELECT FROM jsonb_array_elements(automatic) a WHERE a->>'source_key'=s->>'source_key')) LOOP
  entries:=entries||jsonb_build_array(e);
 END LOOP;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'log_date' NULLS LAST,coalesce((value->>'odometer')::numeric,0),coalesce(value->>'created_at',''),ordinality),'[]') INTO entries FROM jsonb_array_elements(entries) WITH ORDINALITY;
 FOR e IN SELECT value FROM jsonb_array_elements(entries) LOOP
  IF e->>'log_date' IS NOT NULL AND e->>'log_date'<=today THEN
   IF e->>'entry_type' IN ('Oil Change','Air Filter + Oil change') THEN oil_dated:=e; END IF;
   IF e->>'entry_type'='Baseline Start' THEN baseline:=e; END IF;
   IF e->>'entry_type'='Mileage Check' AND e->>'odometer' IS NOT NULL THEN reading:=e; END IF;
  ELSIF e->>'log_date' IS NULL AND e->>'entry_type' IN ('Oil Change','Air Filter + Oil change') THEN oil_undated:=e; END IF;
  IF linked IS NULL AND coalesce((e->>'current_reading')::boolean,false) AND e->'original_odometer'=t->'miles' THEN linked:=e; END IF;
 END LOOP;
 oil:=CASE WHEN oil_undated->>'odometer' IS NOT NULL AND (oil_dated->>'odometer' IS NULL OR (oil_undated->>'odometer')::numeric>=(oil_dated->>'odometer')::numeric) THEN oil_undated ELSE coalesce(oil_dated,oil_undated) END;
 IF t->>'start_miles' IS NOT NULL OR coalesce(t->>'baseline_start_date','')<>'' OR coalesce(t->>'baseline_note','')<>'' THEN baseline:=jsonb_build_object('odometer',t->'start_miles','log_date',t->>'baseline_start_date'); END IF;
 current_miles:=CASE WHEN linked IS NOT NULL THEN (linked->>'odometer')::numeric ELSE (t->>'miles')::numeric END;
 IF reading IS NOT NULL AND (CASE WHEN t->>'miles_updated_at' IS NOT NULL THEN reading->>'log_date'>left(t->>'miles_updated_at',10) OR (reading->>'log_date'=left(t->>'miles_updated_at',10) AND reading->>'created_at'>t->>'miles_updated_at') ELSE current_miles IS NULL OR (reading->>'odometer')::numeric>current_miles END) THEN current_miles:=(reading->>'odometer')::numeric; END IF;
 IF oil IS NOT NULL THEN oil_miles:=(oil->>'odometer')::numeric; oil_date:=oil->>'log_date';
 ELSIF EXISTS(SELECT FROM jsonb_array_elements(entries) a WHERE a->>'source_key' LIKE 'live:oil:%') THEN oil_miles:=(baseline->>'odometer')::numeric; oil_date:=baseline->>'log_date';
 ELSE oil_miles:=coalesce((t->>'last_oil_change_miles')::numeric,(baseline->>'odometer')::numeric); oil_date:=coalesce(t->>'oil_change_date',baseline->>'log_date'); END IF;
 since_oil:=current_miles-oil_miles;
 due_miles:=CASE WHEN source IN ('M&K','MK','M & K') THEN 40000 WHEN source='RYDER' THEN 50000 ELSE 30000 END;
 yellow:=CASE WHEN source IN ('M&K','MK','M & K') THEN 32000 WHEN source='RYDER' THEN 42000 ELSE 26000 END;
 RETURN CASE WHEN since_oil<0 THEN 'CHECK ODOMETER' WHEN since_oil>due_miles THEN 'SERVICE OVERDUE' WHEN since_oil=due_miles THEN 'SERVICE DUE' WHEN since_oil>yellow THEN 'DUE SOON' WHEN since_oil IS NULL OR oil_date IS NULL THEN 'MISSING SERVICE DATA' ELSE 'READY / GOOD' END;
END;
$$;
REVOKE ALL ON FUNCTION private.pm_endpoint_edited(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.pm_readiness_value(jsonb,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
ALTER TABLE public.trucks ADD COLUMN fleet_pm_readiness text;
COMMENT ON COLUMN public.trucks.fleet_pm_readiness IS 'Database-maintained oil-mileage readiness. Refreshed transactionally when relevant truck data, mileage history, or service log changes. Air filters and elapsed months do not affect status.';

CREATE OR REPLACE FUNCTION private.pm_readiness_for_truck(t public.trucks)
RETURNS text LANGUAGE sql VOLATILE SET search_path = pg_catalog AS $$
 SELECT private.pm_readiness_value(to_jsonb(t),
  coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.changed_at,h.id) FROM public.truck_mileage_history h WHERE h.truck_id=t.id),'[]'),
  coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.log_date,s.id) FROM public.truck_service_log_entries s WHERE s.truck_id=t.id),'[]'),
  (now() AT TIME ZONE 'America/Chicago')::date::text);
$$;
-- Trigger-only privilege elevation is necessary: dispatchers can write permitted log
-- entries but cannot directly UPDATE trucks. All functions stay outside the Data API,
-- and EXECUTE is revoked. The originating writes remain protected by existing RLS.
CREATE OR REPLACE FUNCTION private.set_truck_pm_readiness()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.source,NEW.miles,NEW.miles_updated_at,NEW.start_miles,NEW.baseline_start_date,NEW.baseline_note,NEW.last_oil_change_miles,NEW.oil_change_date,NEW.air_filter)
   IS NOT DISTINCT FROM ROW(OLD.source,OLD.miles,OLD.miles_updated_at,OLD.start_miles,OLD.baseline_start_date,OLD.baseline_note,OLD.last_oil_change_miles,OLD.oil_change_date,OLD.air_filter)
   AND NEW.fleet_pm_readiness IS NOT DISTINCT FROM OLD.fleet_pm_readiness THEN
   RETURN NEW;
  END IF;
 END IF;
 NEW.fleet_pm_readiness:=private.pm_readiness_for_truck(NEW);
 RETURN NEW;
END;
$$;
CREATE TRIGGER zz_trucks_fleet_pm_readiness BEFORE INSERT OR UPDATE ON public.trucks
 FOR EACH ROW EXECUTE FUNCTION private.set_truck_pm_readiness();

CREATE OR REPLACE FUNCTION private.refresh_changed_truck_pm_readiness()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE affected uuid[]; t public.trucks; calculated text;
BEGIN
 IF TG_OP='INSERT' THEN SELECT array_agg(DISTINCT truck_id) INTO affected FROM pm_new;
 ELSIF TG_OP='DELETE' THEN SELECT array_agg(DISTINCT truck_id) INTO affected FROM pm_old;
 ELSE SELECT array_agg(DISTINCT truck_id) INTO affected FROM (SELECT truck_id FROM pm_new UNION SELECT truck_id FROM pm_old) ids;
 END IF;
 -- Lock trucks in a consistent order, serializing concurrent edits before computing
 -- from committed history. Bulk pastes/deletes refresh each truck once per statement.
 FOR t IN SELECT * FROM public.trucks WHERE id=ANY(affected) ORDER BY id FOR UPDATE LOOP
  calculated:=private.pm_readiness_for_truck(t);
  IF calculated IS DISTINCT FROM t.fleet_pm_readiness THEN
   UPDATE public.trucks SET fleet_pm_readiness=calculated WHERE id=t.id;
  END IF;
 END LOOP;
 RETURN NULL;
END;
$$;
CREATE TRIGGER pm_service_insert AFTER INSERT ON public.truck_service_log_entries REFERENCING NEW TABLE AS pm_new FOR EACH STATEMENT EXECUTE FUNCTION private.refresh_changed_truck_pm_readiness();
CREATE TRIGGER pm_service_update AFTER UPDATE ON public.truck_service_log_entries REFERENCING OLD TABLE AS pm_old NEW TABLE AS pm_new FOR EACH STATEMENT EXECUTE FUNCTION private.refresh_changed_truck_pm_readiness();
CREATE TRIGGER pm_service_delete AFTER DELETE ON public.truck_service_log_entries REFERENCING OLD TABLE AS pm_old FOR EACH STATEMENT EXECUTE FUNCTION private.refresh_changed_truck_pm_readiness();
CREATE TRIGGER pm_history_insert AFTER INSERT ON public.truck_mileage_history REFERENCING NEW TABLE AS pm_new FOR EACH STATEMENT EXECUTE FUNCTION private.refresh_changed_truck_pm_readiness();
CREATE TRIGGER pm_history_update AFTER UPDATE ON public.truck_mileage_history REFERENCING OLD TABLE AS pm_old NEW TABLE AS pm_new FOR EACH STATEMENT EXECUTE FUNCTION private.refresh_changed_truck_pm_readiness();
CREATE TRIGGER pm_history_delete AFTER DELETE ON public.truck_mileage_history REFERENCING OLD TABLE AS pm_old FOR EACH STATEMENT EXECUTE FUNCTION private.refresh_changed_truck_pm_readiness();
REVOKE ALL ON FUNCTION private.pm_readiness_for_truck(public.trucks) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.set_truck_pm_readiness() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.refresh_changed_truck_pm_readiness() FROM PUBLIC, anon, authenticated;

UPDATE public.trucks t SET fleet_pm_readiness=private.pm_readiness_for_truck(t);
ALTER TABLE public.trucks ALTER COLUMN fleet_pm_readiness SET NOT NULL;
ALTER TABLE public.trucks ALTER COLUMN fleet_pm_readiness SET DEFAULT 'MISSING SERVICE DATA';
ALTER TABLE public.trucks ADD CONSTRAINT trucks_fleet_pm_readiness_values CHECK (fleet_pm_readiness IN ('READY / GOOD','DUE SOON','SERVICE DUE','SERVICE OVERDUE','CHECK ODOMETER','MISSING SERVICE DATA'));

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

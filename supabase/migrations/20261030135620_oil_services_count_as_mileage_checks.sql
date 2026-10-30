-- Oil services provide an odometer reading as well as resetting the oil interval.
CREATE OR REPLACE FUNCTION private.pm_readiness_value(t jsonb, history jsonb, saved jsonb, today text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
   IF e->>'entry_type' IN ('Mileage Check','Oil Change','Air Filter + Oil change') AND e->>'odometer' IS NOT NULL THEN reading:=e; END IF;
  ELSIF e->>'log_date' IS NULL AND e->>'entry_type' IN ('Oil Change','Air Filter + Oil change') THEN oil_undated:=e; END IF;
  IF linked IS NULL AND coalesce((e->>'current_reading')::boolean,false) AND e->'original_odometer'=t->'miles' THEN linked:=e; END IF;
 END LOOP;
 oil:=CASE WHEN oil_undated->>'odometer' IS NOT NULL AND (oil_dated->>'odometer' IS NULL OR (oil_undated->>'odometer')::numeric>=(oil_dated->>'odometer')::numeric) THEN oil_undated ELSE coalesce(oil_dated,oil_undated) END;
 IF t->>'start_miles' IS NOT NULL OR coalesce(t->>'baseline_start_date','')<>'' OR coalesce(t->>'baseline_note','')<>'' THEN baseline:=jsonb_build_object('odometer',t->'start_miles','log_date',t->>'baseline_start_date'); END IF;
 current_miles:=CASE WHEN linked IS NOT NULL THEN (linked->>'odometer')::numeric ELSE (t->>'miles')::numeric END;
 IF reading IS NOT NULL AND (CASE WHEN t->>'miles_updated_at' IS NOT NULL THEN reading->>'log_date'>left(t->>'miles_updated_at',10) OR (reading->>'log_date'=left(t->>'miles_updated_at',10) AND (reading->>'created_at'>t->>'miles_updated_at' OR (reading->>'entry_type' IN ('Oil Change','Air Filter + Oil change') AND (reading->>'odometer')::numeric>=coalesce(current_miles,0)))) ELSE current_miles IS NULL OR (reading->>'odometer')::numeric>current_miles END) THEN current_miles:=(reading->>'odometer')::numeric; END IF;
 IF oil IS NOT NULL THEN oil_miles:=(oil->>'odometer')::numeric; oil_date:=oil->>'log_date';
 ELSIF EXISTS(SELECT FROM jsonb_array_elements(entries) a WHERE a->>'source_key' LIKE 'live:oil:%') THEN oil_miles:=(baseline->>'odometer')::numeric; oil_date:=baseline->>'log_date';
 ELSE oil_miles:=coalesce((t->>'last_oil_change_miles')::numeric,(baseline->>'odometer')::numeric); oil_date:=coalesce(t->>'oil_change_date',baseline->>'log_date'); END IF;
 since_oil:=current_miles-oil_miles;
 due_miles:=CASE WHEN source IN ('M&K','MK','M & K') THEN 40000 WHEN source='RYDER' THEN 50000 ELSE 30000 END;
 yellow:=CASE WHEN source IN ('M&K','MK','M & K') THEN 32000 WHEN source='RYDER' THEN 42000 ELSE 26000 END;
 RETURN CASE WHEN since_oil<0 THEN 'CHECK ODOMETER' WHEN since_oil>due_miles THEN 'SERVICE OVERDUE' WHEN since_oil=due_miles THEN 'SERVICE DUE' WHEN since_oil>yellow THEN 'DUE SOON' WHEN since_oil IS NULL OR oil_date IS NULL THEN 'MISSING SERVICE DATA' ELSE 'READY / GOOD' END;
END;
$function$;


-- Refresh only derived statuses that changed under the new rule.
UPDATE public.trucks t SET fleet_pm_readiness = private.pm_readiness_for_truck(t)
WHERE fleet_pm_readiness IS DISTINCT FROM private.pm_readiness_for_truck(t);

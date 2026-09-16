-- Compact, bounded notifications. Records are still fetched through their own RLS.
-- Deploy this migration before the Reports client. No raw fleet publication changes.
SET LOCAL lock_timeout = '5s';
CREATE TABLE public.reports_live_versions (
  source text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 0,
  keys text[], -- NULL means the statement changed more than 100 keys: reconcile source.
  CONSTRAINT reports_live_keys_bounded CHECK (cardinality(keys) <= 100)
);
ALTER TABLE public.reports_live_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reports_live_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reports_live_versions TO authenticated;
CREATE POLICY "Reports staff can read change identifiers"
ON public.reports_live_versions FOR SELECT TO authenticated
USING ((SELECT public.has_any_role(ARRAY[
  'dispatch','afterhours','manager','admin','accounting','supervisor',
  'safety','maintenance','chicago_management'
]::public.app_role[])));

CREATE FUNCTION public.notify_reports_statement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  old_sql text := 'SELECT NULL::jsonb AS doc WHERE false';
  new_sql text := 'SELECT NULL::jsonb AS doc WHERE false';
  compare_sql text;
  source_name text;
  key_column text := TG_ARGV[0];
  changed_keys text[];
  groups text[] := ARRAY[TG_TABLE_NAME];
  hos_columns text[] := ARRAY['hos_drive_minutes','hos_shift_minutes','hos_break_minutes',
    'hos_cycle_minutes','hos_status','hos_last_updated'];
  ignored_columns text[] := ARRAY['updated_at'];
BEGIN
  IF TG_OP <> 'INSERT' THEN old_sql := 'SELECT to_jsonb(r) AS doc FROM old_rows r'; END IF;
  IF TG_OP <> 'DELETE' THEN new_sql := 'SELECT to_jsonb(r) AS doc FROM new_rows r'; END IF;
  IF TG_TABLE_NAME = 'drivers' THEN groups := ARRAY['drivers','driver_hos']; END IF;
  FOREACH source_name IN ARRAY groups LOOP
    IF source_name = 'driver_hos' THEN
      SELECT string_agg(format('n.doc->%L', col), ',') INTO compare_sql FROM unnest(hos_columns) col;
      compare_sql := 'jsonb_build_array(' || compare_sql || ') IS DISTINCT FROM ' ||
        'jsonb_build_array(' || replace(compare_sql, 'n.doc', 'o.doc') || ')';
      -- Inserts/deletes also require reconciliation, even when HOS fields are all NULL.
      compare_sql := '(' || compare_sql || ' OR n.doc IS NULL OR o.doc IS NULL)';
    ELSE
      ignored_columns := CASE WHEN source_name = 'drivers'
        THEN ARRAY['updated_at'] || hos_columns ELSE ARRAY['updated_at'] END;
      compare_sql := format('(n.doc - %L::text[]) IS DISTINCT FROM (o.doc - %L::text[])',
        ignored_columns, ignored_columns);
    END IF;
    -- Include both old and new parent IDs when a stop/file/transfer moves orders.
    -- Identity join uses the source row PK, which differs from the notification key.
    EXECUTE format($q$
      WITH o AS (%s), n AS (%s), changed AS (
        SELECT o.doc AS old_doc, n.doc AS new_doc FROM o FULL JOIN n
        ON coalesce(o.doc->>'id', o.doc->>'truck_id', o.doc->>'user_id') =
           coalesce(n.doc->>'id', n.doc->>'truck_id', n.doc->>'user_id')
        WHERE %s
      ), ids AS (
        SELECT old_doc->>%L AS key FROM changed UNION SELECT new_doc->>%L FROM changed
      ) SELECT array_agg(key ORDER BY key) FROM (SELECT key FROM ids WHERE key IS NOT NULL ORDER BY key LIMIT 101) bounded
    $q$, old_sql, new_sql, compare_sql, key_column, key_column) INTO changed_keys;
    IF cardinality(changed_keys) > 0 THEN
      INSERT INTO public.reports_live_versions AS v(source, revision, keys)
      VALUES (source_name, 1, CASE WHEN cardinality(changed_keys) > 100 THEN NULL ELSE changed_keys END)
      ON CONFLICT(source) DO UPDATE SET revision = v.revision + 1, keys = EXCLUDED.keys;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_reports_statement() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE table_name text; key_column text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'orders','pickup_drops','order_transfers','drivers','trucks','trailers','truck_telemetry',
    'order_files','truck_notes','lost_day_notes','profiles','user_roles','companies','brokers',
    'dispatcher_status','driver_problems','driver_complaints','driver_drug_tests',
    'efs_other_requests','company_coi_vins','afterhours_schedule','afterhours_assignments',
    'daily_report_permissions','final_update_sends','user_extensions','temporary_plates'
  ] LOOP
    key_column := CASE
      WHEN table_name IN ('pickup_drops','order_transfers','order_files') THEN 'order_id'
      WHEN table_name = 'truck_telemetry' THEN 'truck_id'
      WHEN table_name = 'daily_report_permissions' THEN 'user_id' ELSE 'id' END;
    INSERT INTO public.reports_live_versions(source) VALUES (table_name);
    EXECUTE format('CREATE TRIGGER reports_live_insert AFTER INSERT ON public.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.notify_reports_statement(%L)', table_name, key_column);
    EXECUTE format('CREATE TRIGGER reports_live_update AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.notify_reports_statement(%L)', table_name, key_column);
    EXECUTE format('CREATE TRIGGER reports_live_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.notify_reports_statement(%L)', table_name, key_column);
  END LOOP;
  INSERT INTO public.reports_live_versions(source) VALUES ('driver_hos');
END;
$$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reports_live_versions;

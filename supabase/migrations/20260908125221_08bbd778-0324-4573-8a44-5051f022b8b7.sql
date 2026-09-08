SET lock_timeout = '3s';
DO $$
DECLARE
  t record;
  r record;
  nq text;
  nwc text;
  roles_txt text;
  cmd_txt text;
  attempt int;
  done boolean;
  failed text[] := ARRAY[]::text[];
BEGIN
  FOR t IN
    SELECT DISTINCT n.nspname AS sch, c.relname AS tbl
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public','storage')
  LOOP
    done := false;
    FOR attempt IN 1..5 LOOP
      EXIT WHEN done;
      BEGIN
        FOR r IN
          SELECT pol.polname, pol.polcmd, pol.polpermissive, pol.polroles,
                 pg_get_expr(pol.polqual, pol.polrelid) AS q,
                 pg_get_expr(pol.polwithcheck, pol.polrelid) AS wc
          FROM pg_policy pol
          JOIN pg_class c ON c.oid = pol.polrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = t.sch AND c.relname = t.tbl
        LOOP
          -- idempotent: skip anything already rewritten
          IF coalesce(r.q,'') ~ '\(select (auth\.uid|has_any_role|has_role|get_driver_id_for_user|auth_user_roles|is_schedule_manager)'
             OR coalesce(r.wc,'') ~ '\(select (auth\.uid|has_any_role|has_role|get_driver_id_for_user|auth_user_roles|is_schedule_manager)' THEN
            CONTINUE;
          END IF;

          nq := r.q; nwc := r.wc;
          IF nq IS NOT NULL THEN
            nq := regexp_replace(nq, 'auth\.uid\(\)', '(select auth.uid())', 'g');
            nq := regexp_replace(nq, 'has_any_role\((ARRAY\[[^\]]*\](::app_role\[\])?)\)', '(select has_any_role(\1))', 'g');
            nq := regexp_replace(nq, 'has_role\(\(select auth\.uid\(\)\), (''[a-z_]+''::app_role)\)', '(select has_role((select auth.uid()), \1))', 'g');
            nq := regexp_replace(nq, 'is_schedule_manager\(\(select auth\.uid\(\)\)\)', '(select is_schedule_manager((select auth.uid())))', 'g');
            nq := regexp_replace(nq, 'get_driver_id_for_user\(\)', '(select get_driver_id_for_user())', 'g');
            nq := regexp_replace(nq, '(^|[^a-z_])auth_user_roles\(\)', '\1(select auth_user_roles())', 'g');
          END IF;
          IF nwc IS NOT NULL THEN
            nwc := regexp_replace(nwc, 'auth\.uid\(\)', '(select auth.uid())', 'g');
            nwc := regexp_replace(nwc, 'has_any_role\((ARRAY\[[^\]]*\](::app_role\[\])?)\)', '(select has_any_role(\1))', 'g');
            nwc := regexp_replace(nwc, 'has_role\(\(select auth\.uid\(\)\), (''[a-z_]+''::app_role)\)', '(select has_role((select auth.uid()), \1))', 'g');
            nwc := regexp_replace(nwc, 'is_schedule_manager\(\(select auth\.uid\(\)\)\)', '(select is_schedule_manager((select auth.uid())))', 'g');
            nwc := regexp_replace(nwc, 'get_driver_id_for_user\(\)', '(select get_driver_id_for_user())', 'g');
            nwc := regexp_replace(nwc, '(^|[^a-z_])auth_user_roles\(\)', '\1(select auth_user_roles())', 'g');
          END IF;

          IF nq IS NOT DISTINCT FROM r.q AND nwc IS NOT DISTINCT FROM r.wc THEN
            CONTINUE;
          END IF;

          cmd_txt := CASE r.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END;
          IF r.polroles = '{0}'::oid[] THEN
            roles_txt := 'public';
          ELSE
            SELECT string_agg(quote_ident(rolname), ', ') INTO roles_txt FROM pg_roles WHERE oid = ANY (r.polroles);
          END IF;

          EXECUTE format('DROP POLICY %I ON %I.%I', r.polname, t.sch, t.tbl);
          EXECUTE format(
            'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s %s %s',
            r.polname, t.sch, t.tbl,
            CASE WHEN r.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
            cmd_txt, roles_txt,
            CASE WHEN nq IS NOT NULL THEN 'USING (' || nq || ')' ELSE '' END,
            CASE WHEN nwc IS NOT NULL THEN 'WITH CHECK (' || nwc || ')' ELSE '' END
          );
        END LOOP;
        done := true;
      EXCEPTION
        WHEN lock_not_available OR deadlock_detected THEN
          PERFORM pg_sleep(0.5 * attempt);
      END;
    END LOOP;
    IF NOT done THEN
      failed := failed || (t.sch || '.' || t.tbl);
    END IF;
  END LOOP;
  IF array_length(failed, 1) > 0 THEN
    RAISE NOTICE 'Policies not rewritten (locked): %', failed;
  END IF;
END $$;
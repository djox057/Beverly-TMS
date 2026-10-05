CREATE TABLE public.pretrip_form_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_key text NOT NULL UNIQUE,
 response_key text,
 sheet_id text NOT NULL,
 sheet_tab text NOT NULL,
 source_row integer NOT NULL,
 source_timezone text NOT NULL DEFAULT 'America/Chicago',
 truck_id uuid REFERENCES public.trucks(id) ON DELETE SET NULL,
 truck_number text NOT NULL,
 trailer_number text NOT NULL DEFAULT '',
 driver_name text NOT NULL,
 email text NOT NULL DEFAULT '',
 inspection_date date,
 submitted_at text NOT NULL DEFAULT '',
 complaints text NOT NULL DEFAULT '',
 answers jsonb NOT NULL DEFAULT '{}'::jsonb,
 files jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','imported','unmatched','error','superseded')),
 import_error text,
 last_attempt_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pretrip_form_response_idx ON public.pretrip_form_submissions(response_key);
CREATE INDEX pretrip_form_date_truck_idx ON public.pretrip_form_submissions(inspection_date,truck_id);
ALTER TABLE public.pretrip_form_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pretrip_form_submissions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pretrip_form_submissions TO authenticated;
GRANT ALL ON public.pretrip_form_submissions TO service_role;
CREATE POLICY "pretrip form read" ON public.pretrip_form_submissions FOR SELECT TO authenticated
 USING (public.has_any_role(ARRAY['admin','maintenance','manager','supervisor','dispatch']::public.app_role[]));

CREATE TABLE public.pretrip_form_sync (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled boolean NOT NULL DEFAULT true,
 service_account text,
 last_started_at timestamptz,
 last_finished_at timestamptz,
 last_success_at timestamptz,
 last_error text,
 lease_until timestamptz,
 lease_id uuid
);
INSERT INTO public.pretrip_form_sync(id) VALUES(true);
ALTER TABLE public.pretrip_form_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pretrip_form_sync FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pretrip_form_sync TO authenticated;
GRANT UPDATE(enabled) ON public.pretrip_form_sync TO authenticated;
GRANT ALL ON public.pretrip_form_sync TO service_role;
CREATE POLICY "pretrip sync read" ON public.pretrip_form_sync FOR SELECT TO authenticated
 USING (public.has_any_role(ARRAY['admin','maintenance','manager','supervisor','dispatch']::public.app_role[]));
CREATE POLICY "pretrip sync admin control" ON public.pretrip_form_sync FOR UPDATE TO authenticated
 USING (public.has_any_role(ARRAY['admin','manager']::public.app_role[]))
 WITH CHECK (public.has_any_role(ARRAY['admin','manager']::public.app_role[]));

CREATE FUNCTION public.claim_pretrip_form_sync(_lease_id uuid) RETURNS boolean
 LANGUAGE sql SET search_path='' AS $$
 WITH claimed AS (
 UPDATE public.pretrip_form_sync SET lease_id=_lease_id,lease_until=now()+interval '100 seconds',last_started_at=now()
 WHERE id AND enabled AND (lease_until IS NULL OR lease_until < now()) RETURNING id
 ) SELECT EXISTS(SELECT 1 FROM claimed);
$$;
REVOKE ALL ON FUNCTION public.claim_pretrip_form_sync(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pretrip_form_sync(uuid) TO service_role;

ALTER TABLE public.pretrip_photos
 ADD COLUMN form_submission_id uuid REFERENCES public.pretrip_form_submissions(id) ON DELETE SET NULL,
 ADD COLUMN photo_category text,
 ADD COLUMN google_file_id text;
CREATE UNIQUE INDEX pretrip_form_photo_unique ON public.pretrip_photos(form_submission_id,google_file_id,photo_category)
 WHERE form_submission_id IS NOT NULL;

SELECT cron.schedule('sync-pretrip-google-form','*/5 * * * *', $$
 SELECT net.http_post(
 url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/sync-pretrip-form',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1)),
 body:='{}'::jsonb, timeout_milliseconds:=90000
 );
$$);

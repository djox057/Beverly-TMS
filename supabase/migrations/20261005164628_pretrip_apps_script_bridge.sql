-- Google now pushes via an owner-authorized Apps Script, without service-account sharing.
SELECT cron.unschedule('sync-pretrip-google-form');
UPDATE public.pretrip_form_sync SET last_error=NULL,service_account=NULL,lease_until=NULL,lease_id=NULL;
CREATE TABLE public.pretrip_form_connection (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 token_hash text NOT NULL,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pretrip_form_connection ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pretrip_form_connection FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pretrip_form_connection TO service_role;

CREATE FUNCTION public.rotate_pretrip_form_token() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_role(ARRAY['admin','manager']::public.app_role[]) THEN
  RAISE EXCEPTION 'not allowed';
 END IF;
 token := encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.pretrip_form_connection(id,token_hash,created_by)
 VALUES(true,encode(extensions.digest(token,'sha256'),'hex'),auth.uid())
 ON CONFLICT(id) DO UPDATE SET token_hash=EXCLUDED.token_hash,created_by=EXCLUDED.created_by,created_at=now();
 RETURN token;
END $$;
REVOKE ALL ON FUNCTION public.rotate_pretrip_form_token() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rotate_pretrip_form_token() TO authenticated;

-- Atomically update only one file entry, so replayed uploads cannot lose other photos.
CREATE FUNCTION public.update_pretrip_form_file(_id uuid,_drive_id text,_category text,_patch jsonb) RETURNS void
LANGUAGE sql SET search_path='' AS $$
 UPDATE public.pretrip_form_submissions s SET
 files=(SELECT jsonb_agg(CASE WHEN f->>'drive_id'=_drive_id AND f->>'category'=_category THEN f||_patch ELSE f END) FROM jsonb_array_elements(s.files) f),
 last_attempt_at=now()
 WHERE s.id=_id;
 UPDATE public.pretrip_form_submissions s SET
 status=CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(s.files) f WHERE f->>'status'<>'imported') THEN 'pending' ELSE 'imported' END,
 import_error=CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(s.files) f WHERE f->>'status'='error') THEN 'Some photos could not be imported; Google will retry' ELSE NULL END
 WHERE s.id=_id;
$$;
REVOKE ALL ON FUNCTION public.update_pretrip_form_file(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_pretrip_form_file(uuid,text,text,jsonb) TO service_role;

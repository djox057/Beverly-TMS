ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS pretrip_checked boolean NOT NULL DEFAULT false;

CREATE TABLE public.pretrip_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.pretrip_photos TO authenticated;
GRANT ALL ON public.pretrip_photos TO service_role;
ALTER TABLE public.pretrip_photos ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.pretrip_photos(truck_id);
CREATE POLICY "pretrip photos read" ON public.pretrip_photos FOR SELECT TO authenticated
USING (has_any_role(ARRAY['admin','maintenance','manager','supervisor','dispatch']::app_role[]));
CREATE POLICY "pretrip photos insert" ON public.pretrip_photos FOR INSERT TO authenticated
WITH CHECK (has_any_role(ARRAY['admin','maintenance','manager','supervisor','dispatch']::app_role[]) AND uploaded_by = auth.uid());
CREATE POLICY "pretrip photos delete" ON public.pretrip_photos FOR DELETE TO authenticated
USING (has_any_role(ARRAY['admin','maintenance','manager']::app_role[]) OR uploaded_by = auth.uid());

CREATE POLICY "pretrip storage read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pretrip-photos' AND has_any_role(ARRAY['admin','maintenance','manager','supervisor','dispatch']::app_role[]));
CREATE POLICY "pretrip storage insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pretrip-photos' AND has_any_role(ARRAY['admin','maintenance','manager','supervisor','dispatch']::app_role[]));
CREATE POLICY "pretrip storage delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'pretrip-photos' AND has_any_role(ARRAY['admin','maintenance','manager','supervisor','dispatch']::app_role[]));

CREATE OR REPLACE FUNCTION public.set_truck_pretrip_checked(_truck_id uuid, _checked boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(ARRAY['admin','maintenance','manager']::app_role[]) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.trucks SET pretrip_checked = _checked WHERE id = _truck_id;
END $$;
GRANT EXECUTE ON FUNCTION public.set_truck_pretrip_checked(uuid, boolean) TO authenticated;
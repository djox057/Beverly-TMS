ALTER TABLE public.pretrip_photos
  ADD COLUMN content_sha256 text CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN hash_last_attempt_at timestamptz;

CREATE INDEX pretrip_photo_hash_date_idx ON public.pretrip_photos(content_sha256, inspection_date)
  WHERE content_sha256 IS NOT NULL;
CREATE INDEX pretrip_photo_google_date_idx ON public.pretrip_photos(google_file_id, inspection_date)
  WHERE google_file_id IS NOT NULL;
CREATE INDEX pretrip_photo_hash_pending_idx ON public.pretrip_photos(hash_last_attempt_at NULLS FIRST, id)
  WHERE content_sha256 IS NULL;

-- RLS applies to both the selected week and the matching historical records.
-- Keep original snapshots for drivers; the unit's current driver may have changed.
CREATE FUNCTION public.get_pretrip_photo_reuse(_week_start date)
RETURNS TABLE (
  photo_id uuid,
  previous_photo_id uuid,
  previous_inspection_date date,
  previous_driver_name text,
  previous_truck_number text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT current_photo.id, previous.id, previous.inspection_date,
         previous.driver_name, previous.truck_number
  FROM public.pretrip_photos current_photo
  LEFT JOIN public.pretrip_form_submissions current_form ON current_form.id = current_photo.form_submission_id
  CROSS JOIN LATERAL (
    SELECT old.id, old.inspection_date, old_form.driver_name, truck.truck_number
    FROM public.pretrip_photos old
    LEFT JOIN public.pretrip_form_submissions old_form ON old_form.id = old.form_submission_id
    JOIN public.trucks truck ON truck.id = old.truck_id
    WHERE old.inspection_date < date_trunc('week', _week_start::timestamp)::date
      AND (old_form.status IS NULL OR old_form.status <> 'superseded')
      AND (
        (current_photo.content_sha256 IS NOT NULL AND old.content_sha256 = current_photo.content_sha256)
        OR (nullif(current_photo.google_file_id, '') IS NOT NULL AND old.google_file_id = current_photo.google_file_id)
      )
    ORDER BY old.inspection_date DESC, old.created_at DESC, old.id
    LIMIT 1
  ) previous
  WHERE current_photo.inspection_date >= date_trunc('week', _week_start::timestamp)::date
    AND current_photo.inspection_date < date_trunc('week', _week_start::timestamp)::date + 7
    AND (current_form.status IS NULL OR current_form.status <> 'superseded')
  ORDER BY current_photo.id;
$$;
REVOKE ALL ON FUNCTION public.get_pretrip_photo_reuse(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pretrip_photo_reuse(date) TO authenticated, service_role;

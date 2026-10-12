-- Run as the migration owner. All fixtures are rolled back.
BEGIN;
DO $$
DECLARE
  unit_id uuid := (SELECT truck_id FROM public.pretrip_photos LIMIT 1);
  old_id uuid := gen_random_uuid();
  reused_id uuid := gen_random_uuid();
  sunday_id uuid := gen_random_uuid();
  same_week_one uuid := gen_random_uuid();
  same_week_two uuid := gen_random_uuid();
  google_old uuid := gen_random_uuid();
  google_new uuid := gen_random_uuid();
  future_id uuid := gen_random_uuid();
  current_fresh uuid := gen_random_uuid();
  superseded_form uuid := gen_random_uuid();
  superseded_old uuid := gen_random_uuid();
  superseded_current uuid := gen_random_uuid();
  fingerprint text := encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex');
  same_week_hash text := encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex');
  future_hash text := encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex');
  superseded_hash text := encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex');
  drive_ref text := gen_random_uuid()::text;
BEGIN
  IF unit_id IS NULL THEN RAISE EXCEPTION 'A unit fixture is required'; END IF;
  INSERT INTO public.pretrip_photos(id, truck_id, file_path, inspection_date, content_sha256, google_file_id) VALUES
    (old_id, unit_id, 'test/' || old_id, '2026-10-11', fingerprint, 'original-drive-id-' || drive_ref),
    (reused_id, unit_id, 'test/' || reused_id, '2026-10-12', fingerprint, 'new-drive-id-' || drive_ref),
    (sunday_id, unit_id, 'test/' || sunday_id, '2026-10-18', fingerprint, NULL),
    (same_week_one, unit_id, 'test/' || same_week_one, '2026-10-12', same_week_hash, NULL),
    (same_week_two, unit_id, 'test/' || same_week_two, '2026-10-13', same_week_hash, NULL),
    (google_old, unit_id, 'test/' || google_old, '2026-10-05', NULL, drive_ref),
    (google_new, unit_id, 'test/' || google_new, '2026-10-12', NULL, drive_ref),
    (future_id, unit_id, 'test/' || future_id, '2026-10-19', future_hash, NULL),
    (current_fresh, unit_id, 'test/' || current_fresh, '2026-10-12', future_hash, NULL);

  INSERT INTO public.pretrip_form_submissions(id, source_key, sheet_id, sheet_tab, source_row, truck_id, truck_number, driver_name, inspection_date, status)
    VALUES (superseded_form, 'test-' || superseded_form, 'test', 'test', 2, unit_id, 'Test unit', 'Test driver', '2026-10-05', 'superseded');
  INSERT INTO public.pretrip_photos(id, truck_id, file_path, inspection_date, content_sha256, form_submission_id) VALUES
    (superseded_old, unit_id, 'test/' || superseded_old, '2026-10-05', superseded_hash, superseded_form),
    (superseded_current, unit_id, 'test/' || superseded_current, '2026-10-12', superseded_hash, NULL);

  IF NOT EXISTS (SELECT 1 FROM public.get_pretrip_photo_reuse('2026-10-12')
    WHERE photo_id = reused_id AND previous_photo_id = old_id AND previous_inspection_date = '2026-10-11') THEN
    RAISE EXCEPTION 'Identical bytes with a new file ID did not match the prior Sunday';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_pretrip_photo_reuse('2026-10-14') WHERE photo_id = sunday_id) THEN
    RAISE EXCEPTION 'Week normalization or Sunday boundary failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_pretrip_photo_reuse('2026-10-12') WHERE photo_id = google_new AND previous_photo_id = google_old) THEN
    RAISE EXCEPTION 'Known Google file reuse was not detected while hashing is pending';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_pretrip_photo_reuse('2026-10-12')
    WHERE photo_id IN (old_id, same_week_one, same_week_two, current_fresh, future_id, superseded_current)) THEN
    RAISE EXCEPTION 'Same-week, future or superseded uploads were incorrectly flagged';
  END IF;
  IF has_function_privilege('anon', 'public.get_pretrip_photo_reuse(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users can query private photo matches';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.get_pretrip_photo_reuse(date)'::regprocedure AND prosecdef) THEN
    RAISE EXCEPTION 'Photo matching bypasses RLS';
  END IF;
END;
$$;
-- Verify that a caller with no permitted role cannot access photo history.
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  IF EXISTS (SELECT 1 FROM public.pretrip_photos)
    OR EXISTS (SELECT 1 FROM public.get_pretrip_photo_reuse('2026-10-12')) THEN
    RAISE EXCEPTION 'Unauthorized caller can access private photo history';
  END IF;
END;
$$;
RESET ROLE;
SELECT 'Week boundaries, hash/Google ID matching, same-week/future/superseded exclusions and RLS checks passed' AS result;
ROLLBACK;

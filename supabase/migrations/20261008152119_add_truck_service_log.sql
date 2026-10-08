-- Supplementary per-truck log only. No existing truck fields, triggers or policies change.
CREATE TABLE public.truck_service_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  source_key text,
  log_date date,
  entry_type text NOT NULL CHECK (entry_type IN ('Mileage Check','Oil Change','Air Filter','Air Filter + Oil change','Baseline Start')),
  odometer bigint CHECK (odometer >= 0),
  oil_spec text,
  facility text,
  invoice text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  CHECK (source_key IS NOT NULL OR (log_date IS NOT NULL AND odometer IS NOT NULL)),
  UNIQUE (truck_id, source_key)
);
CREATE INDEX truck_service_log_entries_truck_date_idx ON public.truck_service_log_entries(truck_id, log_date, created_at);
ALTER TABLE public.truck_service_log_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.truck_service_log_entries TO authenticated;
GRANT ALL ON public.truck_service_log_entries TO service_role;

-- Use exact stored roles, matching the application's primary-role priority.
-- SECURITY INVOKER keeps existing truck/driver/user-role RLS in effect.
CREATE FUNCTION public.can_access_truck_service_log(_truck_id uuid, _write boolean DEFAULT false, _entry_type text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH primary_role AS (
    SELECT role::text AS role FROM public.user_roles
    WHERE user_id = auth.uid()
    ORDER BY CASE role::text
      WHEN 'admin' THEN 1 WHEN 'safety' THEN 2 WHEN 'claims' THEN 3
      WHEN 'accounting' THEN 4 WHEN 'manager' THEN 5 WHEN 'supervisor' THEN 6
      WHEN 'chicago_management' THEN 7 WHEN 'maintenance' THEN 8
      WHEN 'dispatch' THEN 9 WHEN 'afterhours' THEN 10 WHEN 'yard' THEN 11
      WHEN 'driver' THEN 12 ELSE 13 END LIMIT 1
  )
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trucks t LEFT JOIN public.drivers d ON d.id = t.driver1_id
    CROSS JOIN primary_role p WHERE t.id = _truck_id AND (
      (NOT _write AND lower(coalesce(auth.jwt()->>'email','')) = 'ella@bfprime.net')
      OR (p.role IN ('dispatch','supervisor')
        AND coalesce(t.dispatcher_id,d.dispatcher_id) = auth.uid()
        AND (NOT _write OR _entry_type = 'Mileage Check'))
      OR (p.role IN ('admin','manager','chicago_management','maintenance','yard','recruiting'))
      OR (NOT _write AND p.role = 'driver' AND lower(d.email) = lower(auth.jwt()->>'email'))
    )
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_truck_service_log(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_truck_service_log(uuid,boolean,text) TO authenticated;
CREATE POLICY truck_service_log_read ON public.truck_service_log_entries FOR SELECT TO authenticated
  USING (public.can_access_truck_service_log(truck_id));
CREATE POLICY truck_service_log_insert ON public.truck_service_log_entries FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_access_truck_service_log(truck_id,true,entry_type));
CREATE POLICY truck_service_log_update ON public.truck_service_log_entries FOR UPDATE TO authenticated
  USING (public.can_access_truck_service_log(truck_id,true,entry_type))
  WITH CHECK (public.can_access_truck_service_log(truck_id,true,entry_type));

-- New log changes are visible to other users viewing the same truck.
ALTER PUBLICATION supabase_realtime ADD TABLE public.truck_service_log_entries;

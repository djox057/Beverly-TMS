-- Retain the details used to format a money code and track entry in Stuff.
ALTER TABLE public.efs_other_requests
  ADD COLUMN purpose_detail text,
  ADD COLUMN is_trailer_repair boolean NOT NULL DEFAULT false,
  ADD COLUMN trailer_number text,
  ADD COLUMN location_name text,
  ADD COLUMN location_address text,
  ADD COLUMN entered_in_stuff boolean NOT NULL DEFAULT false,
  ADD COLUMN stuff_entered_at timestamptz,
  ADD COLUMN stuff_entered_by uuid;
CREATE POLICY "Staff may update money code details" ON public.efs_other_requests
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (select auth.uid())
  AND role IN ('admin', 'accounting', 'manager', 'supervisor', 'dispatch', 'afterhours')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (select auth.uid())
  AND role IN ('admin', 'accounting', 'manager', 'supervisor', 'dispatch', 'afterhours')));
ALTER TABLE public.driver_cash_advances
  ADD COLUMN purpose_detail text,
  ADD COLUMN is_trailer_repair boolean NOT NULL DEFAULT false,
  ADD COLUMN trailer_number text,
  ADD COLUMN location_name text,
  ADD COLUMN location_address text,
  ADD COLUMN entered_in_stuff boolean NOT NULL DEFAULT false,
  ADD COLUMN stuff_entered_at timestamptz,
  ADD COLUMN stuff_entered_by uuid;
CREATE POLICY "Staff may update money code details" ON public.driver_cash_advances
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (select auth.uid())
  AND role IN ('admin', 'accounting', 'manager', 'supervisor', 'dispatch', 'afterhours')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (select auth.uid())
  AND role IN ('admin', 'accounting', 'manager', 'supervisor', 'dispatch', 'afterhours')));
CREATE OR REPLACE FUNCTION public.guard_efs_request_void()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  detail_fields text[] := ARRAY['purpose_detail', 'is_trailer_repair', 'trailer_number', 'location_name', 'location_address', 'entered_in_stuff', 'stuff_entered_at', 'stuff_entered_by'];
  details_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL OR NEW.void_reason IS NOT NULL THEN
      RAISE EXCEPTION 'New requests cannot be created as voided';
    END IF;
    IF NEW.entered_in_stuff OR NEW.stuff_entered_at IS NOT NULL OR NEW.stuff_entered_by IS NOT NULL THEN
      RAISE EXCEPTION 'New requests cannot already be marked as entered in Stuff';
    END IF;
    RETURN NEW;
  END IF;
  details_changed := (to_jsonb(NEW) - detail_fields) IS NOT DISTINCT FROM (to_jsonb(OLD) - detail_fields)
    AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD);
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Voided requests cannot be changed';
  END IF;
  IF NEW.voided_at IS DISTINCT FROM OLD.voided_at
    OR NEW.voided_by IS DISTINCT FROM OLD.voided_by
    OR NEW.void_reason IS DISTINCT FROM OLD.void_reason THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
      AND role IN ('admin', 'accounting', 'manager', 'supervisor', 'dispatch', 'afterhours')) THEN
      RAISE EXCEPTION 'You do not have permission to void requests' USING ERRCODE = '42501';
    END IF;
    IF NEW.voided_at IS NULL OR NULLIF(btrim(NEW.void_reason), '') IS NULL THEN
      RAISE EXCEPTION 'A reason is required to void a request';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['voided_at', 'voided_by', 'void_reason'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['voided_at', 'voided_by', 'void_reason']) THEN
      RAISE EXCEPTION 'Voiding cannot change other request fields';
    END IF;
    NEW.voided_at := clock_timestamp();
    NEW.voided_by := auth.uid();
    NEW.void_reason := btrim(NEW.void_reason);
  ELSIF TG_TABLE_NAME = 'driver_cash_advances' AND auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NOT details_changed THEN
      RAISE EXCEPTION 'Cash advances may only be updated to void them or maintain money code details';
    END IF;
  END IF;
  IF ROW(NEW.purpose_detail, NEW.is_trailer_repair, NEW.trailer_number, NEW.location_name, NEW.location_address, NEW.entered_in_stuff, NEW.stuff_entered_at, NEW.stuff_entered_by)
    IS DISTINCT FROM ROW(OLD.purpose_detail, OLD.is_trailer_repair, OLD.trailer_number, OLD.location_name, OLD.location_address, OLD.entered_in_stuff, OLD.stuff_entered_at, OLD.stuff_entered_by) THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
      AND role IN ('admin', 'accounting', 'manager', 'supervisor', 'dispatch', 'afterhours')) THEN
      RAISE EXCEPTION 'You do not have permission to update money code details' USING ERRCODE = '42501';
    END IF;
    IF NEW.stuff_entered_at IS DISTINCT FROM OLD.stuff_entered_at OR NEW.stuff_entered_by IS DISTINCT FROM OLD.stuff_entered_by THEN
      RAISE EXCEPTION 'Stuff audit fields are assigned by the server';
    END IF;
    IF NEW.entered_in_stuff IS DISTINCT FROM OLD.entered_in_stuff THEN
      NEW.stuff_entered_at := CASE WHEN NEW.entered_in_stuff THEN clock_timestamp() ELSE NULL END;
      NEW.stuff_entered_by := CASE WHEN NEW.entered_in_stuff THEN auth.uid() ELSE NULL END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_efs_request_void() FROM PUBLIC;

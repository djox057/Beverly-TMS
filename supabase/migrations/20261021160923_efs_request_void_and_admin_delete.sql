-- Keep voided requests for audit; only administrators may permanently delete.
ALTER TABLE public.efs_other_requests
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_by uuid,
  ADD COLUMN void_reason text,
  ADD CONSTRAINT efs_void_details CHECK (
    (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
    OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND length(btrim(void_reason)) > 0 AND void_reason IS NOT NULL)
  );
ALTER TABLE public.driver_cash_advances
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_by uuid,
  ADD COLUMN void_reason text,
  ADD CONSTRAINT cash_advance_void_details CHECK (
    (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
    OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND length(btrim(void_reason)) > 0 AND void_reason IS NOT NULL)
  );

-- Restrictive policies also constrain any other permissive delete policies.
CREATE POLICY "Only admins may permanently delete requests"
  ON public.efs_other_requests AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'));
CREATE POLICY "Only admins may permanently delete cash advances"
  ON public.driver_cash_advances AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'));

-- Exact stored roles, without has_role's safety/claims inheritance.
CREATE POLICY "Staff may void EFS requests"
  ON public.efs_other_requests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (select auth.uid())
    AND role IN ('admin', 'accounting', 'manager', 'supervisor', 'dispatch', 'afterhours')))
  WITH CHECK (voided_at IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (select auth.uid())
    AND role IN ('admin', 'accounting', 'manager', 'supervisor', 'dispatch', 'afterhours')));
CREATE POLICY "Staff may void cash advances"
  ON public.driver_cash_advances FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (select auth.uid())
    AND role IN ('admin', 'accounting', 'manager', 'supervisor', 'dispatch', 'afterhours')))
  WITH CHECK (voided_at IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (select auth.uid())
    AND role IN ('admin', 'accounting', 'manager', 'supervisor', 'dispatch', 'afterhours')));

CREATE OR REPLACE FUNCTION public.guard_efs_request_void()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL OR NEW.void_reason IS NOT NULL THEN
      RAISE EXCEPTION 'New requests cannot be created as voided';
    END IF;
    RETURN NEW;
  END IF;
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
    RAISE EXCEPTION 'Cash advances may only be updated to void them';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_efs_request_void() FROM PUBLIC;
CREATE TRIGGER guard_efs_request_void BEFORE INSERT OR UPDATE ON public.efs_other_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_efs_request_void();
CREATE TRIGGER guard_cash_advance_void BEFORE INSERT OR UPDATE ON public.driver_cash_advances
  FOR EACH ROW EXECUTE FUNCTION public.guard_efs_request_void();

-- A voided advance must no longer appear as a deduction. Keep the linked
-- expense intact in the database, just as the original request is retained.
CREATE POLICY "Exclude voided cash advance deductions"
  ON public.driver_expenses AS RESTRICTIVE FOR SELECT TO authenticated
  USING (cash_advance_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.driver_cash_advances ca
    WHERE ca.id = cash_advance_id AND ca.voided_at IS NOT NULL
  ));

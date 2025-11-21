-- RLS Policy Performance Optimization - Batch 4
-- Continuing to wrap all auth.uid() and has_role() calls in (SELECT ...) subqueries

-- =============================================================================
-- PROFILES TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view all profiles" ON public.profiles;
CREATE POLICY "Chicago Management can view all profiles"
ON public.profiles FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can view profiles" ON public.profiles;
CREATE POLICY "Dispatch and higher can view profiles"
ON public.profiles FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view profiles" ON public.profiles;
CREATE POLICY "Maintenance can view profiles"
ON public.profiles FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- =============================================================================
-- RECOVERY_HISTORY TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view recovery history" ON public.recovery_history;
CREATE POLICY "Chicago Management can view recovery history"
ON public.recovery_history FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can create recovery history" ON public.recovery_history;
CREATE POLICY "Dispatch and higher can create recovery history"
ON public.recovery_history FOR INSERT
WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Dispatch and higher can view recovery history" ON public.recovery_history;
CREATE POLICY "Dispatch and higher can view recovery history"
ON public.recovery_history FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view recovery history" ON public.recovery_history;
CREATE POLICY "Maintenance can view recovery history"
ON public.recovery_history FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Managers and admins can update recovery history" ON public.recovery_history;
CREATE POLICY "Managers and admins can update recovery history"
ON public.recovery_history FOR UPDATE
USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

-- =============================================================================
-- TRAILER_FILES TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view trailer files" ON public.trailer_files;
CREATE POLICY "Chicago Management can view trailer files"
ON public.trailer_files FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can view trailer files" ON public.trailer_files;
CREATE POLICY "Dispatch and higher can view trailer files"
ON public.trailer_files FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can create trailer files" ON public.trailer_files;
CREATE POLICY "Maintenance can create trailer files"
ON public.trailer_files FOR INSERT
WITH CHECK ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can delete trailer files" ON public.trailer_files;
CREATE POLICY "Maintenance can delete trailer files"
ON public.trailer_files FOR DELETE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can update trailer files" ON public.trailer_files;
CREATE POLICY "Maintenance can update trailer files"
ON public.trailer_files FOR UPDATE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view trailer files" ON public.trailer_files;
CREATE POLICY "Maintenance can view trailer files"
ON public.trailer_files FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- =============================================================================
-- TRAILERS TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view trailers" ON public.trailers;
CREATE POLICY "Chicago Management can view trailers"
ON public.trailers FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can view trailers" ON public.trailers;
CREATE POLICY "Dispatch and higher can view trailers"
ON public.trailers FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can create trailers" ON public.trailers;
CREATE POLICY "Maintenance can create trailers"
ON public.trailers FOR INSERT
WITH CHECK ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can delete trailers" ON public.trailers;
CREATE POLICY "Maintenance can delete trailers"
ON public.trailers FOR DELETE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can update trailers" ON public.trailers;
CREATE POLICY "Maintenance can update trailers"
ON public.trailers FOR UPDATE
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view trailers" ON public.trailers;
CREATE POLICY "Maintenance can view trailers"
ON public.trailers FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));
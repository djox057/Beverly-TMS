
-- ============================================================
-- BATCH 2: RLS Policy Consolidation for truck_notes, lost_day_notes, truck_files, trailer_files, driver_files
-- ============================================================

-- ==================== TRUCK_NOTES (13 → 4) ====================
-- "All authenticated users" policies already exist and are optimal.
-- Drop all redundant role-based policies that are subsets.
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.truck_notes;
DROP POLICY IF EXISTS "Chicago Management can view truck notes" ON public.truck_notes;
DROP POLICY IF EXISTS "Maintenance can view truck notes" ON public.truck_notes;
DROP POLICY IF EXISTS "Maintenance can view truck_notes" ON public.truck_notes;
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can creat" ON public.truck_notes;
DROP POLICY IF EXISTS "Maintenance can create truck_notes" ON public.truck_notes;
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can updat" ON public.truck_notes;
DROP POLICY IF EXISTS "Maintenance can update truck_notes" ON public.truck_notes;
DROP POLICY IF EXISTS "Maintenance can delete truck_notes" ON public.truck_notes;
-- Keep: "All authenticated users can view/create/update/delete truck notes" (already optimal)

-- ==================== LOST_DAY_NOTES (10 → 4) ====================
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.lost_day_notes;
DROP POLICY IF EXISTS "Chicago Management can view lost day notes" ON public.lost_day_notes;
DROP POLICY IF EXISTS "Maintenance can view lost day notes" ON public.lost_day_notes;
DROP POLICY IF EXISTS "Safety can view lost day notes" ON public.lost_day_notes;
DROP POLICY IF EXISTS "Supervisors can view lost day notes" ON public.lost_day_notes;

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can creat" ON public.lost_day_notes;
DROP POLICY IF EXISTS "Supervisors can create lost day notes" ON public.lost_day_notes;

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can updat" ON public.lost_day_notes;
DROP POLICY IF EXISTS "Supervisors can update lost day notes" ON public.lost_day_notes;

DROP POLICY IF EXISTS "Admins and accounting can delete lost day notes" ON public.lost_day_notes;

CREATE POLICY "Roles can view lost_day_notes" ON public.lost_day_notes FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[]));

CREATE POLICY "Roles can create lost_day_notes" ON public.lost_day_notes FOR INSERT
  WITH CHECK (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor']::app_role[]));

CREATE POLICY "Roles can update lost_day_notes" ON public.lost_day_notes FOR UPDATE
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor']::app_role[]));

CREATE POLICY "Roles can delete lost_day_notes" ON public.lost_day_notes FOR DELETE
  USING (has_any_role(ARRAY['admin','accounting']::app_role[]));

-- ==================== TRUCK_FILES (22 → 6) ====================
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.truck_files;
DROP POLICY IF EXISTS "Dispatch, managers, admins and accounting can view truck_files" ON public.truck_files;
DROP POLICY IF EXISTS "Chicago Management can view truck files" ON public.truck_files;
DROP POLICY IF EXISTS "Maintenance can view truck files" ON public.truck_files;
DROP POLICY IF EXISTS "Maintenance can view truck_files" ON public.truck_files;
DROP POLICY IF EXISTS "Safety can view truck files" ON public.truck_files;
DROP POLICY IF EXISTS "Supervisors can view truck_files" ON public.truck_files;
DROP POLICY IF EXISTS "Drivers can view their truck files" ON public.truck_files;

DROP POLICY IF EXISTS "Managers, admins and accounting can create truck_files" ON public.truck_files;
DROP POLICY IF EXISTS "Maintenance can create truck files" ON public.truck_files;
DROP POLICY IF EXISTS "Maintenance can create truck_files" ON public.truck_files;
DROP POLICY IF EXISTS "Safety can create truck_files" ON public.truck_files;
DROP POLICY IF EXISTS "Supervisors can create truck_files" ON public.truck_files;

DROP POLICY IF EXISTS "Managers, admins and accounting can update truck_files" ON public.truck_files;
DROP POLICY IF EXISTS "Maintenance can update truck files" ON public.truck_files;
DROP POLICY IF EXISTS "Maintenance can update truck_files" ON public.truck_files;
DROP POLICY IF EXISTS "Safety can update truck_files" ON public.truck_files;
DROP POLICY IF EXISTS "Supervisors can update truck_files" ON public.truck_files;

DROP POLICY IF EXISTS "Admins and accounting can delete truck_files" ON public.truck_files;
DROP POLICY IF EXISTS "Maintenance can delete truck files" ON public.truck_files;
DROP POLICY IF EXISTS "Maintenance can delete truck_files" ON public.truck_files;
DROP POLICY IF EXISTS "Safety can delete truck_files" ON public.truck_files;

CREATE POLICY "Roles can view truck_files" ON public.truck_files FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[]));

CREATE POLICY "Drivers can view own truck files" ON public.truck_files FOR SELECT
  USING (truck_id IN (
    SELECT t.id FROM trucks t
    WHERE t.driver1_id IN (
      SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    )
  ));

CREATE POLICY "Roles can create truck_files" ON public.truck_files FOR INSERT
  WITH CHECK (has_any_role(ARRAY['manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

CREATE POLICY "Roles can update truck_files" ON public.truck_files FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

CREATE POLICY "Roles can delete truck_files" ON public.truck_files FOR DELETE
  USING (has_any_role(ARRAY['admin','accounting','safety','maintenance']::app_role[]));

-- ==================== TRAILER_FILES (22 → 6) ====================
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.trailer_files;
DROP POLICY IF EXISTS "Chicago Management can view trailer files" ON public.trailer_files;
DROP POLICY IF EXISTS "Maintenance can view trailer files" ON public.trailer_files;
DROP POLICY IF EXISTS "Maintenance can view trailer_files" ON public.trailer_files;
DROP POLICY IF EXISTS "Safety can view trailer files" ON public.trailer_files;
DROP POLICY IF EXISTS "Safety can view trailer_files" ON public.trailer_files;
DROP POLICY IF EXISTS "Supervisors can view trailer_files" ON public.trailer_files;
DROP POLICY IF EXISTS "Drivers can view their trailer files" ON public.trailer_files;

DROP POLICY IF EXISTS "Managers, admins and accounting can create trailer_files" ON public.trailer_files;
DROP POLICY IF EXISTS "Maintenance can create trailer files" ON public.trailer_files;
DROP POLICY IF EXISTS "Maintenance can create trailer_files" ON public.trailer_files;
DROP POLICY IF EXISTS "Safety can create trailer_files" ON public.trailer_files;
DROP POLICY IF EXISTS "Supervisors can create trailer_files" ON public.trailer_files;

DROP POLICY IF EXISTS "Managers, admins and accounting can update trailer_files" ON public.trailer_files;
DROP POLICY IF EXISTS "Maintenance can update trailer files" ON public.trailer_files;
DROP POLICY IF EXISTS "Maintenance can update trailer_files" ON public.trailer_files;
DROP POLICY IF EXISTS "Safety can update trailer_files" ON public.trailer_files;
DROP POLICY IF EXISTS "Supervisors can update trailer_files" ON public.trailer_files;

DROP POLICY IF EXISTS "Admins and accounting can delete trailer_files" ON public.trailer_files;
DROP POLICY IF EXISTS "Maintenance can delete trailer files" ON public.trailer_files;
DROP POLICY IF EXISTS "Maintenance can delete trailer_files" ON public.trailer_files;
DROP POLICY IF EXISTS "Safety can delete trailer_files" ON public.trailer_files;

CREATE POLICY "Roles can view trailer_files" ON public.trailer_files FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[]));

CREATE POLICY "Drivers can view own trailer files" ON public.trailer_files FOR SELECT
  USING (trailer_id IN (
    SELECT t.trailer_id FROM trucks t
    WHERE t.driver1_id IN (
      SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    )
  ));

CREATE POLICY "Roles can create trailer_files" ON public.trailer_files FOR INSERT
  WITH CHECK (has_any_role(ARRAY['manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

CREATE POLICY "Roles can update trailer_files" ON public.trailer_files FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

CREATE POLICY "Roles can delete trailer_files" ON public.trailer_files FOR DELETE
  USING (has_any_role(ARRAY['admin','accounting','safety','maintenance']::app_role[]));

-- ==================== DRIVER_FILES (16 → 4) ====================
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.driver_files;
DROP POLICY IF EXISTS "Chicago Management can view driver files" ON public.driver_files;
DROP POLICY IF EXISTS "Maintenance can view driver files" ON public.driver_files;
DROP POLICY IF EXISTS "Safety can view driver files" ON public.driver_files;
DROP POLICY IF EXISTS "Supervisors can view driver_files" ON public.driver_files;

DROP POLICY IF EXISTS "Managers, admins and accounting can create driver_files" ON public.driver_files;
DROP POLICY IF EXISTS "Maintenance can create driver_files" ON public.driver_files;
DROP POLICY IF EXISTS "Safety can create driver_files" ON public.driver_files;
DROP POLICY IF EXISTS "Supervisors can create driver_files" ON public.driver_files;

DROP POLICY IF EXISTS "Managers, admins and accounting can update driver_files" ON public.driver_files;
DROP POLICY IF EXISTS "Maintenance can update driver_files" ON public.driver_files;
DROP POLICY IF EXISTS "Safety can update driver_files" ON public.driver_files;
DROP POLICY IF EXISTS "Supervisors can update driver_files" ON public.driver_files;

DROP POLICY IF EXISTS "Admins and accounting can delete driver_files" ON public.driver_files;
DROP POLICY IF EXISTS "Maintenance can delete driver_files" ON public.driver_files;
DROP POLICY IF EXISTS "Safety can delete driver_files" ON public.driver_files;

CREATE POLICY "Roles can view driver_files" ON public.driver_files FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[]));

CREATE POLICY "Roles can create driver_files" ON public.driver_files FOR INSERT
  WITH CHECK (has_any_role(ARRAY['manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

CREATE POLICY "Roles can update driver_files" ON public.driver_files FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

CREATE POLICY "Roles can delete driver_files" ON public.driver_files FOR DELETE
  USING (has_any_role(ARRAY['admin','accounting','safety','maintenance']::app_role[]));

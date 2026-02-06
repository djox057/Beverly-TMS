
-- ============================================================
-- BATCH 1: RLS Policy Consolidation for order_files, trailers, brokers, user_roles, profiles
-- Uses has_any_role() to eliminate per-role subqueries
-- ============================================================

-- ==================== ORDER_FILES (19 → 5) ====================
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.order_files;
DROP POLICY IF EXISTS "Chicago Management can view order files" ON public.order_files;
DROP POLICY IF EXISTS "Maintenance can view order files" ON public.order_files;
DROP POLICY IF EXISTS "Safety can view order files" ON public.order_files;
DROP POLICY IF EXISTS "Supervisors can view order_files" ON public.order_files;
DROP POLICY IF EXISTS "Drivers can view files for their orders v2" ON public.order_files;

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can creat" ON public.order_files;
DROP POLICY IF EXISTS "Maintenance can create order_files" ON public.order_files;
DROP POLICY IF EXISTS "Safety can create order_files" ON public.order_files;
DROP POLICY IF EXISTS "Supervisors can create order_files" ON public.order_files;

DROP POLICY IF EXISTS "Dispatch and afterhours can update order_files" ON public.order_files;
DROP POLICY IF EXISTS "Managers, admins and accounting can update order_files" ON public.order_files;
DROP POLICY IF EXISTS "Maintenance can update order_files" ON public.order_files;
DROP POLICY IF EXISTS "Safety can update order_files" ON public.order_files;
DROP POLICY IF EXISTS "Supervisors can update order_files" ON public.order_files;

DROP POLICY IF EXISTS "Admins and accounting can delete order_files" ON public.order_files;
DROP POLICY IF EXISTS "Dispatch and afterhours can delete order_files" ON public.order_files;
DROP POLICY IF EXISTS "Maintenance can delete order_files" ON public.order_files;
DROP POLICY IF EXISTS "Safety can delete order_files" ON public.order_files;

CREATE POLICY "Roles can view order_files" ON public.order_files FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[]));

CREATE POLICY "Drivers can view own order files" ON public.order_files FOR SELECT
  USING (
    has_role(auth.uid(), 'driver'::app_role)
    AND order_id IN (
      SELECT id FROM orders
      WHERE driver1_id = (auth.jwt() ->> 'driver_id')::uuid
         OR driver2_id = (auth.jwt() ->> 'driver_id')::uuid
    )
  );

CREATE POLICY "Roles can create order_files" ON public.order_files FOR INSERT
  WITH CHECK (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

CREATE POLICY "Roles can update order_files" ON public.order_files FOR UPDATE
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

CREATE POLICY "Roles can delete order_files" ON public.order_files FOR DELETE
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','safety','maintenance']::app_role[]));

-- ==================== TRAILERS (19 → 6) ====================
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.trailers;
DROP POLICY IF EXISTS "Chicago Management can view trailers" ON public.trailers;
DROP POLICY IF EXISTS "Maintenance can view trailers" ON public.trailers;
DROP POLICY IF EXISTS "Safety can view trailers" ON public.trailers;
DROP POLICY IF EXISTS "Supervisors can view trailers" ON public.trailers;
DROP POLICY IF EXISTS "Yard can view trailers" ON public.trailers;
DROP POLICY IF EXISTS "Dispatch can view trailers on their trucks" ON public.trailers;
DROP POLICY IF EXISTS "Drivers can view trailers on their trucks" ON public.trailers;

DROP POLICY IF EXISTS "Managers, admins and accounting can create trailers" ON public.trailers;
DROP POLICY IF EXISTS "Maintenance can create trailers" ON public.trailers;
DROP POLICY IF EXISTS "Safety can create trailers" ON public.trailers;
DROP POLICY IF EXISTS "Supervisors can create trailers" ON public.trailers;

DROP POLICY IF EXISTS "Managers, admins and accounting can update trailers" ON public.trailers;
DROP POLICY IF EXISTS "Maintenance can update trailers" ON public.trailers;
DROP POLICY IF EXISTS "Safety can update trailers" ON public.trailers;
DROP POLICY IF EXISTS "Supervisors can update trailers" ON public.trailers;

DROP POLICY IF EXISTS "Admins and accounting can delete trailers" ON public.trailers;
DROP POLICY IF EXISTS "Maintenance can delete trailers" ON public.trailers;
DROP POLICY IF EXISTS "Safety can delete trailers" ON public.trailers;

CREATE POLICY "Roles can view trailers" ON public.trailers FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management','yard']::app_role[]));

CREATE POLICY "Drivers can view own trailers" ON public.trailers FOR SELECT
  USING (id IN (
    SELECT t.trailer_id FROM trucks t
    WHERE t.driver1_id IN (
      SELECT d.id FROM drivers d JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    )
  ));

CREATE POLICY "Roles can create trailers" ON public.trailers FOR INSERT
  WITH CHECK (has_any_role(ARRAY['manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

CREATE POLICY "Roles can update trailers" ON public.trailers FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin','accounting','supervisor','safety','maintenance']::app_role[]));

CREATE POLICY "Roles can delete trailers" ON public.trailers FOR DELETE
  USING (has_any_role(ARRAY['admin','accounting','safety','maintenance']::app_role[]));

-- ==================== BROKERS (11 → 4) ====================
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.brokers;
DROP POLICY IF EXISTS "Chicago Management can view brokers" ON public.brokers;
DROP POLICY IF EXISTS "Maintenance can view brokers" ON public.brokers;
DROP POLICY IF EXISTS "Safety can view brokers" ON public.brokers;
DROP POLICY IF EXISTS "Supervisors can view brokers" ON public.brokers;
DROP POLICY IF EXISTS "Yard can view brokers" ON public.brokers;

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can creat" ON public.brokers;
DROP POLICY IF EXISTS "Supervisors can create brokers" ON public.brokers;

DROP POLICY IF EXISTS "Managers, admins and accounting can update brokers" ON public.brokers;
DROP POLICY IF EXISTS "Supervisors can update brokers" ON public.brokers;

DROP POLICY IF EXISTS "Admins and accounting can delete brokers" ON public.brokers;

CREATE POLICY "Roles can view brokers" ON public.brokers FOR SELECT
  USING (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management','yard']::app_role[]));

CREATE POLICY "Roles can create brokers" ON public.brokers FOR INSERT
  WITH CHECK (has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor']::app_role[]));

CREATE POLICY "Roles can update brokers" ON public.brokers FOR UPDATE
  USING (has_any_role(ARRAY['manager','admin','accounting','supervisor']::app_role[]));

CREATE POLICY "Roles can delete brokers" ON public.brokers FOR DELETE
  USING (has_any_role(ARRAY['admin','accounting']::app_role[]));

-- ==================== USER_ROLES (15 → 5) ====================
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins and accounting can view all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Afterhours can view all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Chicago Management can view user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Dispatch can view dispatcher-related user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Maintenance can view user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can view all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can view user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Safety can view dispatch, supervisor, manager and admin roles" ON public.user_roles;
DROP POLICY IF EXISTS "Supervisors can view user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

DROP POLICY IF EXISTS "Admins can create user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;

-- Most roles can view all user_roles (needed for role checks)
CREATE POLICY "Roles can view user_roles" ON public.user_roles FOR SELECT
  USING (has_any_role(ARRAY['manager','admin','accounting','afterhours','supervisor','maintenance','chicago_management']::app_role[]));

-- Users can always see their own roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

-- Dispatch can view related roles only
CREATE POLICY "Dispatch can view related roles" ON public.user_roles FOR SELECT
  USING (
    has_role(auth.uid(), 'dispatch'::app_role)
    AND role = ANY(ARRAY['dispatch','afterhours','manager','supervisor','maintenance']::app_role[])
  );

-- Safety can view specific roles only
CREATE POLICY "Safety can view related roles" ON public.user_roles FOR SELECT
  USING (
    has_role(auth.uid(), 'safety'::app_role)
    AND role = ANY(ARRAY['dispatch','supervisor','manager','admin']::app_role[])
  );

CREATE POLICY "Admins can manage user_roles" ON public.user_roles FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ==================== PROFILES (14 → 4) ====================
-- Note: "Authenticated users can view all profiles" (qual: true) already exists
-- making ALL other SELECT policies redundant. Remove the redundant ones.
DROP POLICY IF EXISTS "Admins and accounting can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Afterhours can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Chicago Management can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Chicago Management can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Dispatch can view dispatcher-related profiles" ON public.profiles;
DROP POLICY IF EXISTS "Dispatchers and afterhours can view dispatchers, afterhours, su" ON public.profiles;
DROP POLICY IF EXISTS "Maintenance can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Managers, admins and accounting can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Supervisors can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
-- Keep: "Authenticated users can view all profiles" (already optimal - single true check)
-- Keep: "Users can insert their own profile"
-- Keep: "Users can update own profile"
-- Keep: "Drivers can update their own profile"

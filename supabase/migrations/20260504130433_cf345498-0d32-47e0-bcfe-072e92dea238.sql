
-- 1. Remove anon select on drivers
DROP POLICY IF EXISTS "Allow anon select" ON public.drivers;

-- 2. Restrict driver_problems SELECT to authenticated operational roles
DROP POLICY IF EXISTS "Users can view all driver problems" ON public.driver_problems;
CREATE POLICY "Operational roles can view driver problems"
ON public.driver_problems
FOR SELECT
TO authenticated
USING (
  public.has_any_role(ARRAY[
    'dispatch'::app_role,
    'afterhours'::app_role,
    'manager'::app_role,
    'admin'::app_role,
    'accounting'::app_role,
    'supervisor'::app_role,
    'safety'::app_role,
    'maintenance'::app_role,
    'chicago_management'::app_role,
    'yard'::app_role
  ])
);

-- 3. Restrict dispatcher_monthly_bonuses to admin/manager/accounting
DROP POLICY IF EXISTS "Authenticated users can view dispatcher bonuses" ON public.dispatcher_monthly_bonuses;
DROP POLICY IF EXISTS "Authenticated users can insert dispatcher bonuses" ON public.dispatcher_monthly_bonuses;
DROP POLICY IF EXISTS "Authenticated users can update dispatcher bonuses" ON public.dispatcher_monthly_bonuses;
DROP POLICY IF EXISTS "Authenticated users can delete dispatcher bonuses" ON public.dispatcher_monthly_bonuses;

CREATE POLICY "Finance roles can view dispatcher bonuses"
ON public.dispatcher_monthly_bonuses
FOR SELECT
TO authenticated
USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'accounting'::app_role]));

CREATE POLICY "Finance roles can insert dispatcher bonuses"
ON public.dispatcher_monthly_bonuses
FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'accounting'::app_role]));

CREATE POLICY "Finance roles can update dispatcher bonuses"
ON public.dispatcher_monthly_bonuses
FOR UPDATE
TO authenticated
USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'accounting'::app_role]))
WITH CHECK (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'accounting'::app_role]));

CREATE POLICY "Finance roles can delete dispatcher bonuses"
ON public.dispatcher_monthly_bonuses
FOR DELETE
TO authenticated
USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'accounting'::app_role]));

-- 4. Restrict proximity_tracking to authenticated users
DROP POLICY IF EXISTS "System can select proximity tracking" ON public.proximity_tracking;
DROP POLICY IF EXISTS "System can insert proximity tracking" ON public.proximity_tracking;
DROP POLICY IF EXISTS "System can update proximity tracking" ON public.proximity_tracking;
DROP POLICY IF EXISTS "System can delete proximity tracking" ON public.proximity_tracking;

CREATE POLICY "Operational roles can view proximity tracking"
ON public.proximity_tracking
FOR SELECT
TO authenticated
USING (
  public.has_any_role(ARRAY[
    'dispatch'::app_role,
    'afterhours'::app_role,
    'manager'::app_role,
    'admin'::app_role,
    'supervisor'::app_role,
    'safety'::app_role,
    'maintenance'::app_role,
    'chicago_management'::app_role,
    'yard'::app_role
  ])
);

CREATE POLICY "Admin roles can insert proximity tracking"
ON public.proximity_tracking
FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'safety'::app_role]));

CREATE POLICY "Admin roles can update proximity tracking"
ON public.proximity_tracking
FOR UPDATE
TO authenticated
USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'safety'::app_role]))
WITH CHECK (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'safety'::app_role]));

CREATE POLICY "Admin roles can delete proximity tracking"
ON public.proximity_tracking
FOR DELETE
TO authenticated
USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'safety'::app_role]));

-- BATCH 5: pickup_drops, profiles, recovery_history

-- PICKUP_DROPS TABLE
DROP POLICY IF EXISTS "Chicago Management can view pickup drops" ON public.pickup_drops;
CREATE POLICY "Chicago Management can view pickup drops" ON public.pickup_drops
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch and afterhours can delete pickup_drops" ON public.pickup_drops;
CREATE POLICY "Dispatch and afterhours can delete pickup_drops" ON public.pickup_drops
FOR DELETE USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can creat" ON public.pickup_drops;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can creat" ON public.pickup_drops
FOR INSERT WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.pickup_drops;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.pickup_drops
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can view pickup drops" ON public.pickup_drops;
CREATE POLICY "Maintenance can view pickup drops" ON public.pickup_drops
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Managers, admins and accounting can delete pickup_drops" ON public.pickup_drops;
CREATE POLICY "Managers, admins and accounting can delete pickup_drops" ON public.pickup_drops
FOR DELETE USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Supervisors can create pickup drops" ON public.pickup_drops;
CREATE POLICY "Supervisors can create pickup drops" ON public.pickup_drops
FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can delete pickup drops" ON public.pickup_drops;
CREATE POLICY "Supervisors can delete pickup drops" ON public.pickup_drops
FOR DELETE USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can update pickup drops" ON public.pickup_drops;
CREATE POLICY "Supervisors can update pickup drops" ON public.pickup_drops
FOR UPDATE USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view pickup drops" ON public.pickup_drops;
CREATE POLICY "Supervisors can view pickup drops" ON public.pickup_drops
FOR SELECT USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

-- PROFILES TABLE
DROP POLICY IF EXISTS "Chicago Management can view all profiles" ON public.profiles;
CREATE POLICY "Chicago Management can view all profiles" ON public.profiles
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Maintenance can view all profiles" ON public.profiles;
CREATE POLICY "Maintenance can view all profiles" ON public.profiles
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

-- RECOVERY_HISTORY TABLE
DROP POLICY IF EXISTS "Chicago Management can view recovery history" ON public.recovery_history;
CREATE POLICY "Chicago Management can view recovery history" ON public.recovery_history
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch and higher can create recovery history" ON public.recovery_history;
CREATE POLICY "Dispatch and higher can create recovery history" ON public.recovery_history
FOR INSERT WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

DROP POLICY IF EXISTS "Dispatch and higher can update recovery history" ON public.recovery_history;
CREATE POLICY "Dispatch and higher can update recovery history" ON public.recovery_history
FOR UPDATE USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

DROP POLICY IF EXISTS "Dispatch and higher can view recovery history" ON public.recovery_history;
CREATE POLICY "Dispatch and higher can view recovery history" ON public.recovery_history
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can view recovery history" ON public.recovery_history;
CREATE POLICY "Maintenance can view recovery history" ON public.recovery_history
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Managers, admins, accounting can delete recovery history" ON public.recovery_history;
CREATE POLICY "Managers, admins, accounting can delete recovery history" ON public.recovery_history
FOR DELETE USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);
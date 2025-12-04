-- BATCH 4A: exported_weeks, lost_day_notes only

-- EXPORTED_WEEKS TABLE
DROP POLICY IF EXISTS "Authenticated users can insert exported weeks" ON public.exported_weeks;
CREATE POLICY "Authenticated users can insert exported weeks" ON public.exported_weeks
FOR INSERT WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR 
  has_role((SELECT auth.uid()), 'chicago_management'::app_role)
);

DROP POLICY IF EXISTS "Authenticated users can view exported weeks" ON public.exported_weeks;
CREATE POLICY "Authenticated users can view exported weeks" ON public.exported_weeks
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR 
  has_role((SELECT auth.uid()), 'chicago_management'::app_role)
);

-- LOST_DAY_NOTES TABLE
DROP POLICY IF EXISTS "Chicago Management can view lost day notes" ON public.lost_day_notes;
CREATE POLICY "Chicago Management can view lost day notes" ON public.lost_day_notes
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can creat" ON public.lost_day_notes;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can creat" ON public.lost_day_notes
FOR INSERT WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can updat" ON public.lost_day_notes;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can updat" ON public.lost_day_notes
FOR UPDATE USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.lost_day_notes;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.lost_day_notes
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can view lost day notes" ON public.lost_day_notes;
CREATE POLICY "Maintenance can view lost day notes" ON public.lost_day_notes
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));
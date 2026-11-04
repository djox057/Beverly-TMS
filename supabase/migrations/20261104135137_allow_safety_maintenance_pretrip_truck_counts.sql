-- Pre-trip statistics needs the same historical denominator for Safety and Maintenance.
-- Preserve all existing readers and change only the SELECT predicate.
ALTER POLICY "Roles can view dispatcher_daily_driver_counts"
ON public.dispatcher_daily_driver_counts
USING ((SELECT public.has_any_role(ARRAY[
  'dispatch', 'afterhours', 'manager', 'admin', 'accounting',
  'supervisor', 'chicago_management', 'safety', 'maintenance'
]::public.app_role[])));

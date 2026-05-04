-- 1. Remove anon SELECT on trucks/trailers (sensitive fleet data)
DROP POLICY IF EXISTS "Allow anon select" ON public.trucks;
DROP POLICY IF EXISTS "Allow anon select" ON public.trailers;

-- 2. Enable RLS + management read policy on analytics_locked_daily tables
ALTER TABLE public.analytics_locked_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_locked_daily_staging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Management can read analytics locked daily" ON public.analytics_locked_daily;
CREATE POLICY "Management can read analytics locked daily"
  ON public.analytics_locked_daily
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'accounting'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'chicago_management'::app_role)
  );

DROP POLICY IF EXISTS "Management can read analytics locked daily staging" ON public.analytics_locked_daily_staging;
CREATE POLICY "Management can read analytics locked daily staging"
  ON public.analytics_locked_daily_staging
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'accounting'::app_role)
  );

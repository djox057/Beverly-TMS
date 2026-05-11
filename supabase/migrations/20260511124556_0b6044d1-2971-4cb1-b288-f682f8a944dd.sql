DROP POLICY IF EXISTS "Roles can create orders" ON public.orders;
CREATE POLICY "Roles can create orders"
ON public.orders
FOR INSERT
WITH CHECK (
  has_any_role(ARRAY['dispatch'::app_role,'afterhours'::app_role,'manager'::app_role,'admin'::app_role,'accounting'::app_role,'safety'::app_role,'supervisor'::app_role])
);

DROP POLICY IF EXISTS "Dispatch can update unlocked orders" ON public.orders;
CREATE POLICY "Dispatch can update unlocked orders"
ON public.orders
FOR UPDATE
USING (
  (has_any_role(ARRAY['dispatch'::app_role,'afterhours'::app_role]) AND locked = false)
  OR has_any_role(ARRAY['manager'::app_role,'supervisor'::app_role,'admin'::app_role,'accounting'::app_role])
)
WITH CHECK (
  has_any_role(ARRAY['dispatch'::app_role,'afterhours'::app_role,'manager'::app_role,'supervisor'::app_role,'admin'::app_role,'accounting'::app_role])
);
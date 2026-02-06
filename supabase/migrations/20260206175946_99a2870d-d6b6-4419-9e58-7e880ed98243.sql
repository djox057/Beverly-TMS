
-- ORDERS: 20 policies → 8
DROP POLICY IF EXISTS "Admins and accounting can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authorized users to update orders" ON public.orders;
DROP POLICY IF EXISTS "Chicago Management can view orders" ON public.orders;
DROP POLICY IF EXISTS "Dispatch and afterhours can update unlocked orders" ON public.orders;
DROP POLICY IF EXISTS "Dispatch, afterhours and higher roles can create orders" ON public.orders;
DROP POLICY IF EXISTS "Dispatchers and afterhours can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Drivers can view their own orders v2" ON public.orders;
DROP POLICY IF EXISTS "Maintenance can create orders" ON public.orders;
DROP POLICY IF EXISTS "Maintenance can update unlocked orders" ON public.orders;
DROP POLICY IF EXISTS "Maintenance can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Managers, admins and accounting can update all orders" ON public.orders;
DROP POLICY IF EXISTS "Managers, admins, accounting, safety and supervisors can view a" ON public.orders;
DROP POLICY IF EXISTS "Managers, supervisors and admins can mark loads as recovery" ON public.orders;
DROP POLICY IF EXISTS "Safety can create orders" ON public.orders;
DROP POLICY IF EXISTS "Safety can update unlocked orders" ON public.orders;
DROP POLICY IF EXISTS "Safety can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Supervisors can create orders" ON public.orders;
DROP POLICY IF EXISTS "Supervisors can update orders" ON public.orders;
DROP POLICY IF EXISTS "Supervisors can view orders" ON public.orders;
DROP POLICY IF EXISTS "Yard role can view yard loads" ON public.orders;

CREATE POLICY "Roles can view all orders" ON public.orders
FOR SELECT USING (
  has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','supervisor','safety','maintenance','chicago_management']::app_role[])
);

CREATE POLICY "Drivers can view own orders" ON public.orders
FOR SELECT USING (
  has_role(auth.uid(), 'driver'::app_role)
  AND (driver1_id = (auth.jwt() ->> 'driver_id')::uuid OR driver2_id = (auth.jwt() ->> 'driver_id')::uuid)
);

CREATE POLICY "Yard can view yard loads" ON public.orders
FOR SELECT USING (
  has_role(auth.uid(), 'yard'::app_role) AND driver1_id IS NULL AND truck_id IS NULL
);

CREATE POLICY "Roles can create orders" ON public.orders
FOR INSERT WITH CHECK (
  has_any_role(ARRAY['dispatch','afterhours','manager','admin','accounting','safety','supervisor','maintenance']::app_role[])
);

CREATE POLICY "Managers can update all orders" ON public.orders
FOR UPDATE USING (
  has_any_role(ARRAY['manager','supervisor','admin','accounting']::app_role[])
) WITH CHECK (
  has_any_role(ARRAY['manager','supervisor','admin','accounting']::app_role[])
);

CREATE POLICY "Dispatch can update unlocked orders" ON public.orders
FOR UPDATE USING (
  has_any_role(ARRAY['dispatch','afterhours','maintenance']::app_role[]) AND locked = false
) WITH CHECK (
  has_any_role(ARRAY['dispatch','afterhours','maintenance']::app_role[])
);

CREATE POLICY "Safety can update unlocked orders" ON public.orders
FOR UPDATE USING (
  has_role(auth.uid(), 'safety'::app_role) AND locked = false
) WITH CHECK (
  has_role(auth.uid(), 'safety'::app_role) AND locked = false
);

CREATE POLICY "Roles can delete orders" ON public.orders
FOR DELETE USING (
  has_any_role(ARRAY['admin','accounting']::app_role[])
);

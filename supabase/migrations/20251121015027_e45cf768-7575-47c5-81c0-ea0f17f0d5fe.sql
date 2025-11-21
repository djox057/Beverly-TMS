-- RLS Policy Performance Optimization - Batch 3
-- Continuing to wrap all auth.uid() and has_role() calls in (SELECT ...) subqueries

-- =============================================================================
-- LOST_DAY_NOTES TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view lost day notes" ON public.lost_day_notes;
CREATE POLICY "Chicago Management can view lost day notes"
ON public.lost_day_notes FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can create lost day notes" ON public.lost_day_notes;
CREATE POLICY "Dispatch and higher can create lost day notes"
ON public.lost_day_notes FOR INSERT
WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Dispatch and higher can view lost day notes" ON public.lost_day_notes;
CREATE POLICY "Dispatch and higher can view lost day notes"
ON public.lost_day_notes FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view lost day notes" ON public.lost_day_notes;
CREATE POLICY "Maintenance can view lost day notes"
ON public.lost_day_notes FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Managers and admins can delete lost day notes" ON public.lost_day_notes;
CREATE POLICY "Managers and admins can delete lost day notes"
ON public.lost_day_notes FOR DELETE
USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Managers and admins can update lost day notes" ON public.lost_day_notes;
CREATE POLICY "Managers and admins can update lost day notes"
ON public.lost_day_notes FOR UPDATE
USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

-- =============================================================================
-- ORDER_FILES TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view order files" ON public.order_files;
CREATE POLICY "Chicago Management can view order files"
ON public.order_files FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can create order files" ON public.order_files;
CREATE POLICY "Dispatch and higher can create order files"
ON public.order_files FOR INSERT
WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Dispatch and higher can view order files" ON public.order_files;
CREATE POLICY "Dispatch and higher can view order files"
ON public.order_files FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view order files" ON public.order_files;
CREATE POLICY "Maintenance can view order files"
ON public.order_files FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Managers and admins can delete order files" ON public.order_files;
CREATE POLICY "Managers and admins can delete order files"
ON public.order_files FOR DELETE
USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Managers and admins can update order files" ON public.order_files;
CREATE POLICY "Managers and admins can update order files"
ON public.order_files FOR UPDATE
USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

-- =============================================================================
-- ORDERS TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view orders" ON public.orders;
CREATE POLICY "Chicago Management can view orders"
ON public.orders FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can create orders" ON public.orders;
CREATE POLICY "Dispatch and higher can create orders"
ON public.orders FOR INSERT
WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Dispatch and higher can view orders" ON public.orders;
CREATE POLICY "Dispatch and higher can view orders"
ON public.orders FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view orders" ON public.orders;
CREATE POLICY "Maintenance can view orders"
ON public.orders FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Managers and admins can delete orders" ON public.orders;
CREATE POLICY "Managers and admins can delete orders"
ON public.orders FOR DELETE
USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

-- =============================================================================
-- PICKUP_DROPS TABLE POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "Chicago Management can view pickup drops" ON public.pickup_drops;
CREATE POLICY "Chicago Management can view pickup drops"
ON public.pickup_drops FOR SELECT
USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Dispatch and higher can create pickup drops" ON public.pickup_drops;
CREATE POLICY "Dispatch and higher can create pickup drops"
ON public.pickup_drops FOR INSERT
WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Dispatch and higher can view pickup drops" ON public.pickup_drops;
CREATE POLICY "Dispatch and higher can view pickup drops"
ON public.pickup_drops FOR SELECT
USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view pickup drops" ON public.pickup_drops;
CREATE POLICY "Maintenance can view pickup drops"
ON public.pickup_drops FOR SELECT
USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Managers and admins can delete pickup drops" ON public.pickup_drops;
CREATE POLICY "Managers and admins can delete pickup drops"
ON public.pickup_drops FOR DELETE
USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Managers and admins can update pickup drops" ON public.pickup_drops;
CREATE POLICY "Managers and admins can update pickup drops"
ON public.pickup_drops FOR UPDATE
USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);
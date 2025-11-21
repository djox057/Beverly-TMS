-- Optimize RLS policies - Batch 5: Maintenance role policies for driver_drug_tests, driver_files, driver_performance, drivers, lost_day_notes, order_files, orders, trucks
-- Lines 86-107 from performance audit

-- driver_drug_tests - maintenance
DROP POLICY IF EXISTS "Maintenance can delete drug tests" ON public.driver_drug_tests;
CREATE POLICY "Maintenance can delete drug tests" ON public.driver_drug_tests
FOR DELETE USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can insert drug tests" ON public.driver_drug_tests;
CREATE POLICY "Maintenance can insert drug tests" ON public.driver_drug_tests
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can update drug tests" ON public.driver_drug_tests;
CREATE POLICY "Maintenance can update drug tests" ON public.driver_drug_tests
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view drug tests" ON public.driver_drug_tests;
CREATE POLICY "Maintenance can view drug tests" ON public.driver_drug_tests
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

-- driver_files - maintenance
DROP POLICY IF EXISTS "Maintenance can create driver_files" ON public.driver_files;
CREATE POLICY "Maintenance can create driver_files" ON public.driver_files
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can delete driver_files" ON public.driver_files;
CREATE POLICY "Maintenance can delete driver_files" ON public.driver_files
FOR DELETE USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can update driver_files" ON public.driver_files;
CREATE POLICY "Maintenance can update driver_files" ON public.driver_files
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view driver files" ON public.driver_files;
CREATE POLICY "Maintenance can view driver files" ON public.driver_files
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

-- driver_performance - maintenance
DROP POLICY IF EXISTS "Maintenance can view driver performance" ON public.driver_performance;
CREATE POLICY "Maintenance can view driver performance" ON public.driver_performance
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

-- drivers - maintenance
DROP POLICY IF EXISTS "Maintenance can create drivers" ON public.drivers;
CREATE POLICY "Maintenance can create drivers" ON public.drivers
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can delete drivers" ON public.drivers;
CREATE POLICY "Maintenance can delete drivers" ON public.drivers
FOR DELETE USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can update drivers" ON public.drivers;
CREATE POLICY "Maintenance can update drivers" ON public.drivers
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view drivers" ON public.drivers;
CREATE POLICY "Maintenance can view drivers" ON public.drivers
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

-- lost_day_notes - maintenance
DROP POLICY IF EXISTS "Maintenance can view lost day notes" ON public.lost_day_notes;
CREATE POLICY "Maintenance can view lost day notes" ON public.lost_day_notes
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

-- order_files - maintenance
DROP POLICY IF EXISTS "Maintenance can create order_files" ON public.order_files;
CREATE POLICY "Maintenance can create order_files" ON public.order_files
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can delete order_files" ON public.order_files;
CREATE POLICY "Maintenance can delete order_files" ON public.order_files
FOR DELETE USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can update order_files" ON public.order_files;
CREATE POLICY "Maintenance can update order_files" ON public.order_files
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view order files" ON public.order_files;
CREATE POLICY "Maintenance can view order files" ON public.order_files
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

-- orders - maintenance
DROP POLICY IF EXISTS "Maintenance can create orders" ON public.orders;
CREATE POLICY "Maintenance can create orders" ON public.orders
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can view all orders" ON public.orders;
CREATE POLICY "Maintenance can view all orders" ON public.orders
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

DROP POLICY IF EXISTS "Maintenance can update unlocked orders" ON public.orders;
CREATE POLICY "Maintenance can update unlocked orders" ON public.orders
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role)) AND NOT COALESCE(locked, false)
);

-- trucks - maintenance
DROP POLICY IF EXISTS "Maintenance can create trucks" ON public.trucks;
CREATE POLICY "Maintenance can create trucks" ON public.trucks
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);
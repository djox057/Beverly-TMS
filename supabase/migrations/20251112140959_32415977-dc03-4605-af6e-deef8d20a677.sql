-- BROKERS TABLE
CREATE POLICY "Maintenance can view brokers" 
ON public.brokers 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- COMPANIES TABLE
CREATE POLICY "Maintenance can view companies" 
ON public.companies 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- DRIVER_DRUG_TESTS TABLE
CREATE POLICY "Maintenance can delete drug tests" 
ON public.driver_drug_tests 
FOR DELETE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can insert drug tests" 
ON public.driver_drug_tests 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update drug tests" 
ON public.driver_drug_tests 
FOR UPDATE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can view drug tests" 
ON public.driver_drug_tests 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- DRIVER_FILES TABLE
CREATE POLICY "Maintenance can create driver_files" 
ON public.driver_files 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can delete driver_files" 
ON public.driver_files 
FOR DELETE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update driver_files" 
ON public.driver_files 
FOR UPDATE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can view driver files" 
ON public.driver_files 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- DRIVER_PERFORMANCE TABLE
CREATE POLICY "Maintenance can view driver performance" 
ON public.driver_performance 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- DRIVER_PII_AUDIT_LOG TABLE
CREATE POLICY "Maintenance can view PII audit logs" 
ON public.driver_pii_audit_log 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- DRIVER_SENSITIVE_PII TABLE
CREATE POLICY "Maintenance can view driver sensitive PII" 
ON public.driver_sensitive_pii 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- DRIVER_TERMINATION_NOTES TABLE
CREATE POLICY "Maintenance can view termination notes" 
ON public.driver_termination_notes 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- DRIVERS TABLE
CREATE POLICY "Maintenance can create drivers" 
ON public.drivers 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can delete drivers" 
ON public.drivers 
FOR DELETE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update drivers" 
ON public.drivers 
FOR UPDATE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can view drivers" 
ON public.drivers 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- LOST_DAY_NOTES TABLE
CREATE POLICY "Maintenance can view lost day notes" 
ON public.lost_day_notes 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- ORDER_FILES TABLE
CREATE POLICY "Maintenance can create order_files" 
ON public.order_files 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can delete order_files" 
ON public.order_files 
FOR DELETE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update order_files" 
ON public.order_files 
FOR UPDATE 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can view order files" 
ON public.order_files 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- ORDERS TABLE
CREATE POLICY "Maintenance can create orders" 
ON public.orders 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can view all orders" 
ON public.orders 
FOR SELECT 
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update unlocked orders" 
ON public.orders 
FOR UPDATE 
USING (has_role(auth.uid(), 'maintenance'::app_role) AND locked = false)
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));
-- Optimize RLS policies - Batch 6 FINAL: Maintenance, Chicago Management, and remaining policies
-- Lines 108-168 from performance audit - COMPLETES ALL 168 POLICIES

-- trucks - maintenance
DROP POLICY IF EXISTS "Maintenance can delete trucks" ON public.trucks;
CREATE POLICY "Maintenance can delete trucks" ON public.trucks
FOR DELETE USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can update trucks" ON public.trucks;
CREATE POLICY "Maintenance can update trucks" ON public.trucks
FOR UPDATE USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view trucks" ON public.trucks;
CREATE POLICY "Maintenance can view trucks" ON public.trucks
FOR SELECT USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- trailers - maintenance
DROP POLICY IF EXISTS "Maintenance can create trailers" ON public.trailers;
CREATE POLICY "Maintenance can create trailers" ON public.trailers
FOR INSERT WITH CHECK ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can delete trailers" ON public.trailers;
CREATE POLICY "Maintenance can delete trailers" ON public.trailers
FOR DELETE USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can update trailers" ON public.trailers;
CREATE POLICY "Maintenance can update trailers" ON public.trailers
FOR UPDATE USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view trailers" ON public.trailers;
CREATE POLICY "Maintenance can view trailers" ON public.trailers
FOR SELECT USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- truck_notes - maintenance
DROP POLICY IF EXISTS "Maintenance can create truck_notes" ON public.truck_notes;
CREATE POLICY "Maintenance can create truck_notes" ON public.truck_notes
FOR INSERT WITH CHECK ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can delete truck_notes" ON public.truck_notes;
CREATE POLICY "Maintenance can delete truck_notes" ON public.truck_notes
FOR DELETE USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can update truck_notes" ON public.truck_notes;
CREATE POLICY "Maintenance can update truck_notes" ON public.truck_notes
FOR UPDATE USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view truck_notes" ON public.truck_notes;
CREATE POLICY "Maintenance can view truck_notes" ON public.truck_notes
FOR SELECT USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- truck_note_history - maintenance
DROP POLICY IF EXISTS "Maintenance can view truck_note_history" ON public.truck_note_history;
CREATE POLICY "Maintenance can view truck_note_history" ON public.truck_note_history
FOR SELECT USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- trailer_files - maintenance
DROP POLICY IF EXISTS "Maintenance can create trailer_files" ON public.trailer_files;
CREATE POLICY "Maintenance can create trailer_files" ON public.trailer_files
FOR INSERT WITH CHECK ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can delete trailer_files" ON public.trailer_files;
CREATE POLICY "Maintenance can delete trailer_files" ON public.trailer_files
FOR DELETE USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can update trailer_files" ON public.trailer_files;
CREATE POLICY "Maintenance can update trailer_files" ON public.trailer_files
FOR UPDATE USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view trailer_files" ON public.trailer_files;
CREATE POLICY "Maintenance can view trailer_files" ON public.trailer_files
FOR SELECT USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- truck_files - maintenance
DROP POLICY IF EXISTS "Maintenance can create truck_files" ON public.truck_files;
CREATE POLICY "Maintenance can create truck_files" ON public.truck_files
FOR INSERT WITH CHECK ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can delete truck_files" ON public.truck_files;
CREATE POLICY "Maintenance can delete truck_files" ON public.truck_files
FOR DELETE USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can update truck_files" ON public.truck_files;
CREATE POLICY "Maintenance can update truck_files" ON public.truck_files
FOR UPDATE USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

DROP POLICY IF EXISTS "Maintenance can view truck_files" ON public.truck_files;
CREATE POLICY "Maintenance can view truck_files" ON public.truck_files
FOR SELECT USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- truck_locations - maintenance
DROP POLICY IF EXISTS "Maintenance can view truck_locations" ON public.truck_locations;
CREATE POLICY "Maintenance can view truck_locations" ON public.truck_locations
FOR SELECT USING ((SELECT has_role(auth.uid(), 'maintenance'::app_role)));

-- assignment_history
DROP POLICY IF EXISTS "Authenticated users can view assignment history" ON public.assignment_history;
CREATE POLICY "Authenticated users can view assignment history" ON public.assignment_history
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

-- drivers
DROP POLICY IF EXISTS "Authenticated users can view driver companies" ON public.drivers;
CREATE POLICY "Authenticated users can view driver companies" ON public.drivers
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'safety'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'maintenance'::app_role))
);

-- dispatcher_daily_driver_counts
DROP POLICY IF EXISTS "Dispatch and higher can view dispatcher daily counts" ON public.dispatcher_daily_driver_counts;
CREATE POLICY "Dispatch and higher can view dispatcher daily counts" ON public.dispatcher_daily_driver_counts
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

-- Chicago Management policies (lines 132-159)
DROP POLICY IF EXISTS "Chicago Management can view assignment history" ON public.assignment_history;
CREATE POLICY "Chicago Management can view assignment history" ON public.assignment_history
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view brokers" ON public.brokers;
CREATE POLICY "Chicago Management can view brokers" ON public.brokers
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view companies" ON public.companies;
CREATE POLICY "Chicago Management can view companies" ON public.companies
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view company files" ON public.company_files;
CREATE POLICY "Chicago Management can view company files" ON public.company_files
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view dispatcher daily counts" ON public.dispatcher_daily_driver_counts;
CREATE POLICY "Chicago Management can view dispatcher daily counts" ON public.dispatcher_daily_driver_counts
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view dispatcher status" ON public.dispatcher_status;
CREATE POLICY "Chicago Management can view dispatcher status" ON public.dispatcher_status
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view drivers" ON public.drivers;
CREATE POLICY "Chicago Management can view drivers" ON public.drivers
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view driver files" ON public.driver_files;
CREATE POLICY "Chicago Management can view driver files" ON public.driver_files
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view driver performance" ON public.driver_performance;
CREATE POLICY "Chicago Management can view driver performance" ON public.driver_performance
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view driver drug tests" ON public.driver_drug_tests;
CREATE POLICY "Chicago Management can view driver drug tests" ON public.driver_drug_tests
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view driver sensitive PII" ON public.driver_sensitive_pii;
CREATE POLICY "Chicago Management can view driver sensitive PII" ON public.driver_sensitive_pii
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view PII audit logs" ON public.driver_pii_audit_log;
CREATE POLICY "Chicago Management can view PII audit logs" ON public.driver_pii_audit_log
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view driver termination notes" ON public.driver_termination_notes;
CREATE POLICY "Chicago Management can view driver termination notes" ON public.driver_termination_notes
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view lost day notes" ON public.lost_day_notes;
CREATE POLICY "Chicago Management can view lost day notes" ON public.lost_day_notes
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view orders" ON public.orders;
CREATE POLICY "Chicago Management can view orders" ON public.orders
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view order files" ON public.order_files;
CREATE POLICY "Chicago Management can view order files" ON public.order_files
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view pickup drops" ON public.pickup_drops;
CREATE POLICY "Chicago Management can view pickup drops" ON public.pickup_drops
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view profiles" ON public.profiles;
CREATE POLICY "Chicago Management can view profiles" ON public.profiles
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view recovery history" ON public.recovery_history;
CREATE POLICY "Chicago Management can view recovery history" ON public.recovery_history
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view trailers" ON public.trailers;
CREATE POLICY "Chicago Management can view trailers" ON public.trailers
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view trailer files" ON public.trailer_files;
CREATE POLICY "Chicago Management can view trailer files" ON public.trailer_files
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view trucks" ON public.trucks;
CREATE POLICY "Chicago Management can view trucks" ON public.trucks
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view truck files" ON public.truck_files;
CREATE POLICY "Chicago Management can view truck files" ON public.truck_files
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view truck locations" ON public.truck_locations;
CREATE POLICY "Chicago Management can view truck locations" ON public.truck_locations
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view truck notes" ON public.truck_notes;
CREATE POLICY "Chicago Management can view truck notes" ON public.truck_notes
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view truck note history" ON public.truck_note_history;
CREATE POLICY "Chicago Management can view truck note history" ON public.truck_note_history
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view canceled orders backup" ON public.canceled_orders_backup;
CREATE POLICY "Chicago Management can view canceled orders backup" ON public.canceled_orders_backup
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

DROP POLICY IF EXISTS "Chicago Management can view user roles" ON public.user_roles;
CREATE POLICY "Chicago Management can view user roles" ON public.user_roles
FOR SELECT USING ((SELECT has_role(auth.uid(), 'chicago_management'::app_role)));

-- recovery_history
DROP POLICY IF EXISTS "Dispatch and higher can create recovery history" ON public.recovery_history;
CREATE POLICY "Dispatch and higher can create recovery history" ON public.recovery_history
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role))
);

-- dispatcher_notes
DROP POLICY IF EXISTS "Managers, admins and chicago_management can view dispatcher not" ON public.dispatcher_notes;
CREATE POLICY "Managers, admins and chicago_management can view dispatcher not" ON public.dispatcher_notes
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'chicago_management'::app_role))
);

DROP POLICY IF EXISTS "Managers, admins and chicago_management can insert dispatcher n" ON public.dispatcher_notes;
CREATE POLICY "Managers, admins and chicago_management can insert dispatcher n" ON public.dispatcher_notes
FOR INSERT WITH CHECK (
  ((SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
   (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
   (SELECT has_role(auth.uid(), 'chicago_management'::app_role))) 
  AND (date = CURRENT_DATE)
);

DROP POLICY IF EXISTS "Managers, admins and chicago_management can update dispatcher n" ON public.dispatcher_notes;
CREATE POLICY "Managers, admins and chicago_management can update dispatcher n" ON public.dispatcher_notes
FOR UPDATE USING (
  ((SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
   (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
   (SELECT has_role(auth.uid(), 'chicago_management'::app_role))) 
  AND (date = CURRENT_DATE)
);

DROP POLICY IF EXISTS "Managers, admins and chicago_management can delete dispatcher n" ON public.dispatcher_notes;
CREATE POLICY "Managers, admins and chicago_management can delete dispatcher n" ON public.dispatcher_notes
FOR DELETE USING (
  ((SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
   (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
   (SELECT has_role(auth.uid(), 'chicago_management'::app_role))) 
  AND (date = CURRENT_DATE)
);

-- driver_yard_actions
DROP POLICY IF EXISTS "Dispatch and higher can view driver yard actions" ON public.driver_yard_actions;
CREATE POLICY "Dispatch and higher can view driver yard actions" ON public.driver_yard_actions
FOR SELECT USING (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'chicago_management'::app_role))
);

DROP POLICY IF EXISTS "Dispatch and higher can create driver yard actions" ON public.driver_yard_actions;
CREATE POLICY "Dispatch and higher can create driver yard actions" ON public.driver_yard_actions
FOR INSERT WITH CHECK (
  (SELECT has_role(auth.uid(), 'dispatch'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'afterhours'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'accounting'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'supervisor'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'chicago_management'::app_role))
);

DROP POLICY IF EXISTS "Managers and admins can update driver yard actions" ON public.driver_yard_actions;
CREATE POLICY "Managers and admins can update driver yard actions" ON public.driver_yard_actions
FOR UPDATE USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Managers and admins can delete driver yard actions" ON public.driver_yard_actions;
CREATE POLICY "Managers and admins can delete driver yard actions" ON public.driver_yard_actions
FOR DELETE USING (
  (SELECT has_role(auth.uid(), 'manager'::app_role)) OR 
  (SELECT has_role(auth.uid(), 'admin'::app_role))
);
-- BATCH 6: trailer_files, trailers, truck_files, truck_locations, truck_note_history, truck_notes, trucks, user_roles

-- TRAILER_FILES TABLE
DROP POLICY IF EXISTS "Chicago Management can view trailer files" ON public.trailer_files;
CREATE POLICY "Chicago Management can view trailer files" ON public.trailer_files
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.trailer_files;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.trailer_files
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can create trailer files" ON public.trailer_files;
CREATE POLICY "Maintenance can create trailer files" ON public.trailer_files
FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can delete trailer files" ON public.trailer_files;
CREATE POLICY "Maintenance can delete trailer files" ON public.trailer_files
FOR DELETE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can update trailer files" ON public.trailer_files;
CREATE POLICY "Maintenance can update trailer files" ON public.trailer_files
FOR UPDATE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can view trailer files" ON public.trailer_files;
CREATE POLICY "Maintenance can view trailer files" ON public.trailer_files
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

-- TRAILERS TABLE
DROP POLICY IF EXISTS "Chicago Management can view trailers" ON public.trailers;
CREATE POLICY "Chicago Management can view trailers" ON public.trailers
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.trailers;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.trailers
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can create trailers" ON public.trailers;
CREATE POLICY "Maintenance can create trailers" ON public.trailers
FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can delete trailers" ON public.trailers;
CREATE POLICY "Maintenance can delete trailers" ON public.trailers
FOR DELETE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can update trailers" ON public.trailers;
CREATE POLICY "Maintenance can update trailers" ON public.trailers
FOR UPDATE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can view trailers" ON public.trailers;
CREATE POLICY "Maintenance can view trailers" ON public.trailers
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

-- TRUCK_FILES TABLE
DROP POLICY IF EXISTS "Chicago Management can view truck files" ON public.truck_files;
CREATE POLICY "Chicago Management can view truck files" ON public.truck_files
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.truck_files;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.truck_files
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can create truck files" ON public.truck_files;
CREATE POLICY "Maintenance can create truck files" ON public.truck_files
FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can delete truck files" ON public.truck_files;
CREATE POLICY "Maintenance can delete truck files" ON public.truck_files
FOR DELETE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can update truck files" ON public.truck_files;
CREATE POLICY "Maintenance can update truck files" ON public.truck_files
FOR UPDATE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can view truck files" ON public.truck_files;
CREATE POLICY "Maintenance can view truck files" ON public.truck_files
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

-- TRUCK_LOCATIONS TABLE
DROP POLICY IF EXISTS "Chicago Management can view truck locations" ON public.truck_locations;
CREATE POLICY "Chicago Management can view truck locations" ON public.truck_locations
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.truck_locations;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.truck_locations
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can view truck locations" ON public.truck_locations;
CREATE POLICY "Maintenance can view truck locations" ON public.truck_locations
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

-- TRUCK_NOTE_HISTORY TABLE
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.truck_note_history;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.truck_note_history
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can view truck note history" ON public.truck_note_history;
CREATE POLICY "Maintenance can view truck note history" ON public.truck_note_history
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

-- TRUCK_NOTES TABLE
DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can creat" ON public.truck_notes;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can creat" ON public.truck_notes
FOR INSERT WITH CHECK (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can updat" ON public.truck_notes;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can updat" ON public.truck_notes
FOR UPDATE USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.truck_notes;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.truck_notes
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can view truck notes" ON public.truck_notes;
CREATE POLICY "Maintenance can view truck notes" ON public.truck_notes
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

-- TRUCKS TABLE
DROP POLICY IF EXISTS "Chicago Management can view trucks" ON public.trucks;
CREATE POLICY "Chicago Management can view trucks" ON public.trucks
FOR SELECT USING (has_role((SELECT auth.uid()), 'chicago_management'::app_role));

DROP POLICY IF EXISTS "Dispatch, afterhours, managers, admins and accounting can view " ON public.trucks;
CREATE POLICY "Dispatch, afterhours, managers, admins and accounting can view " ON public.trucks
FOR SELECT USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

DROP POLICY IF EXISTS "Maintenance can create trucks" ON public.trucks;
CREATE POLICY "Maintenance can create trucks" ON public.trucks
FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can delete trucks" ON public.trucks;
CREATE POLICY "Maintenance can delete trucks" ON public.trucks
FOR DELETE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can update trucks" ON public.trucks;
CREATE POLICY "Maintenance can update trucks" ON public.trucks
FOR UPDATE USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

DROP POLICY IF EXISTS "Maintenance can view trucks" ON public.trucks;
CREATE POLICY "Maintenance can view trucks" ON public.trucks
FOR SELECT USING (has_role((SELECT auth.uid()), 'maintenance'::app_role));

-- USER_ROLES TABLE
DROP POLICY IF EXISTS "Admins can create user roles" ON public.user_roles;
CREATE POLICY "Admins can create user roles" ON public.user_roles
FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;
CREATE POLICY "Admins can delete user roles" ON public.user_roles
FOR DELETE USING (has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
CREATE POLICY "Admins can update user roles" ON public.user_roles
FOR UPDATE USING (has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
CREATE POLICY "Admins can view all user roles" ON public.user_roles
FOR SELECT USING (has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Managers can view user roles" ON public.user_roles;
CREATE POLICY "Managers can view user roles" ON public.user_roles
FOR SELECT USING (has_role((SELECT auth.uid()), 'manager'::app_role));
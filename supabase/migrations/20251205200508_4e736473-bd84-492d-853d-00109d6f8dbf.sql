-- Allow authenticated users to check cache timestamp
CREATE POLICY "Authenticated users can view archived_orders_metadata" 
ON public.archived_orders_metadata 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Allow admins, managers, and accounting to insert metadata
CREATE POLICY "Admins managers accounting can insert archived_orders_metadata" 
ON public.archived_orders_metadata 
FOR INSERT 
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

-- Allow admins, managers, and accounting to update metadata
CREATE POLICY "Admins managers accounting can update archived_orders_metadata" 
ON public.archived_orders_metadata 
FOR UPDATE 
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

-- Allow admins and accounting to delete metadata
CREATE POLICY "Admins and accounting can delete archived_orders_metadata" 
ON public.archived_orders_metadata 
FOR DELETE 
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);
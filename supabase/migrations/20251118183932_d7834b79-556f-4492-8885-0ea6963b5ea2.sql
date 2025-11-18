-- Drop existing policies for dispatcher_notes
DROP POLICY IF EXISTS "Managers, supervisors and admins can view dispatcher notes" ON public.dispatcher_notes;
DROP POLICY IF EXISTS "Managers, supervisors and admins can insert dispatcher notes" ON public.dispatcher_notes;
DROP POLICY IF EXISTS "Managers, supervisors and admins can update dispatcher notes" ON public.dispatcher_notes;
DROP POLICY IF EXISTS "Managers, supervisors and admins can delete dispatcher notes" ON public.dispatcher_notes;

-- Create new policies that include chicago_management role
CREATE POLICY "Managers, admins and chicago_management can view dispatcher notes"
ON public.dispatcher_notes
FOR SELECT
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'chicago_management'::app_role)
);

CREATE POLICY "Managers, admins and chicago_management can insert dispatcher notes"
ON public.dispatcher_notes
FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'manager'::app_role) OR 
   has_role(auth.uid(), 'admin'::app_role) OR 
   has_role(auth.uid(), 'chicago_management'::app_role)) 
  AND (date = CURRENT_DATE)
);

CREATE POLICY "Managers, admins and chicago_management can update dispatcher notes"
ON public.dispatcher_notes
FOR UPDATE
USING (
  (has_role(auth.uid(), 'manager'::app_role) OR 
   has_role(auth.uid(), 'admin'::app_role) OR 
   has_role(auth.uid(), 'chicago_management'::app_role)) 
  AND (date = CURRENT_DATE)
);

CREATE POLICY "Managers, admins and chicago_management can delete dispatcher notes"
ON public.dispatcher_notes
FOR DELETE
USING (
  (has_role(auth.uid(), 'manager'::app_role) OR 
   has_role(auth.uid(), 'admin'::app_role) OR 
   has_role(auth.uid(), 'chicago_management'::app_role)) 
  AND (date = CURRENT_DATE)
);
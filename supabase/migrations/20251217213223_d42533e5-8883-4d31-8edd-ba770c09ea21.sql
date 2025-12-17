-- Create christmas_notes table
CREATE TABLE public.christmas_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  truck_id uuid REFERENCES public.trucks(id) ON DELETE SET NULL,
  dispatcher_id uuid NOT NULL,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(driver_id)
);

-- Enable RLS
ALTER TABLE public.christmas_notes ENABLE ROW LEVEL SECURITY;

-- Dispatchers can view notes for their drivers
CREATE POLICY "Dispatchers can view their drivers christmas notes"
ON public.christmas_notes
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR
  has_role((SELECT auth.uid()), 'chicago_management'::app_role)
);

-- Dispatchers can insert notes for their drivers
CREATE POLICY "Dispatchers can insert christmas notes for their drivers"
ON public.christmas_notes
FOR INSERT
WITH CHECK (
  dispatcher_id = (SELECT auth.uid()) AND
  (has_role((SELECT auth.uid()), 'dispatch'::app_role) OR
   has_role((SELECT auth.uid()), 'afterhours'::app_role) OR
   has_role((SELECT auth.uid()), 'manager'::app_role) OR
   has_role((SELECT auth.uid()), 'admin'::app_role) OR
   has_role((SELECT auth.uid()), 'supervisor'::app_role))
);

-- Dispatchers can update their own notes
CREATE POLICY "Dispatchers can update their christmas notes"
ON public.christmas_notes
FOR UPDATE
USING (
  dispatcher_id = (SELECT auth.uid()) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- Dispatchers can delete their own notes
CREATE POLICY "Dispatchers can delete their christmas notes"
ON public.christmas_notes
FOR DELETE
USING (
  dispatcher_id = (SELECT auth.uid()) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- Trigger for updated_at
CREATE TRIGGER update_christmas_notes_updated_at
BEFORE UPDATE ON public.christmas_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
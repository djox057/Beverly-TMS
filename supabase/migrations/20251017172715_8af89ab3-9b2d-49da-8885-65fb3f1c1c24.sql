-- Create table for driver termination notes
CREATE TABLE IF NOT EXISTS public.driver_termination_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_termination_notes ENABLE ROW LEVEL SECURITY;

-- Policies for driver_termination_notes
CREATE POLICY "Managers, admins and accounting can view termination notes"
  ON public.driver_termination_notes
  FOR SELECT
  USING (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'accounting'::app_role)
  );

CREATE POLICY "Managers, admins and accounting can create termination notes"
  ON public.driver_termination_notes
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'accounting'::app_role)
  );

CREATE POLICY "Safety can view termination notes"
  ON public.driver_termination_notes
  FOR SELECT
  USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Supervisors can view termination notes"
  ON public.driver_termination_notes
  FOR SELECT
  USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create termination notes"
  ON public.driver_termination_notes
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_driver_termination_notes_updated_at
  BEFORE UPDATE ON public.driver_termination_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
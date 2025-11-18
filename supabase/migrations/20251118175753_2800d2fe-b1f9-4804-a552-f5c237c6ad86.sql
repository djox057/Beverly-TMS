-- Create dispatcher_notes table
CREATE TABLE public.dispatcher_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_id uuid NOT NULL,
  date date NOT NULL,
  note text NOT NULL,
  color text NOT NULL CHECK (color IN ('red', 'yellow', 'green')),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  UNIQUE(dispatcher_id, date)
);

-- Enable RLS
ALTER TABLE public.dispatcher_notes ENABLE ROW LEVEL SECURITY;

-- Managers, supervisors, and admins can view all notes
CREATE POLICY "Managers, supervisors and admins can view dispatcher notes"
ON public.dispatcher_notes
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Managers, supervisors, and admins can insert notes (only for current day)
CREATE POLICY "Managers, supervisors and admins can insert dispatcher notes"
ON public.dispatcher_notes
FOR INSERT
TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'manager'::app_role) OR 
   has_role(auth.uid(), 'supervisor'::app_role) OR 
   has_role(auth.uid(), 'admin'::app_role)) AND
  date = CURRENT_DATE
);

-- Managers, supervisors, and admins can update notes (only for current day)
CREATE POLICY "Managers, supervisors and admins can update dispatcher notes"
ON public.dispatcher_notes
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'manager'::app_role) OR 
   has_role(auth.uid(), 'supervisor'::app_role) OR 
   has_role(auth.uid(), 'admin'::app_role)) AND
  date = CURRENT_DATE
);

-- Managers, supervisors, and admins can delete notes (only for current day)
CREATE POLICY "Managers, supervisors and admins can delete dispatcher notes"
ON public.dispatcher_notes
FOR DELETE
TO authenticated
USING (
  (has_role(auth.uid(), 'manager'::app_role) OR 
   has_role(auth.uid(), 'supervisor'::app_role) OR 
   has_role(auth.uid(), 'admin'::app_role)) AND
  date = CURRENT_DATE
);

-- Create index for faster queries
CREATE INDEX idx_dispatcher_notes_dispatcher_date ON public.dispatcher_notes(dispatcher_id, date);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_dispatcher_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_dispatcher_notes_updated_at
BEFORE UPDATE ON public.dispatcher_notes
FOR EACH ROW
EXECUTE FUNCTION update_dispatcher_notes_updated_at();
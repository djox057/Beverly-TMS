-- Add is_active and termination_date columns to trucks table
ALTER TABLE public.trucks
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS termination_date DATE;

-- Add is_active and termination_date columns to trailers table
ALTER TABLE public.trailers
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS termination_date DATE;

-- Create truck_termination_notes table
CREATE TABLE IF NOT EXISTS public.truck_termination_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id UUID NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create trailer_termination_notes table
CREATE TABLE IF NOT EXISTS public.trailer_termination_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trailer_id UUID NOT NULL REFERENCES public.trailers(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.truck_termination_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trailer_termination_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies for truck_termination_notes
CREATE POLICY "Authenticated users can view truck termination notes"
ON public.truck_termination_notes FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR
  has_role((SELECT auth.uid()), 'safety'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role)
);

CREATE POLICY "Managers admins can insert truck termination notes"
ON public.truck_termination_notes FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'safety'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role)
);

CREATE POLICY "Managers admins can update truck termination notes"
ON public.truck_termination_notes FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'safety'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role)
);

CREATE POLICY "Managers admins can delete truck termination notes"
ON public.truck_termination_notes FOR DELETE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'safety'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role)
);

-- RLS policies for trailer_termination_notes
CREATE POLICY "Authenticated users can view trailer termination notes"
ON public.trailer_termination_notes FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR
  has_role((SELECT auth.uid()), 'safety'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role)
);

CREATE POLICY "Managers admins can insert trailer termination notes"
ON public.trailer_termination_notes FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'safety'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role)
);

CREATE POLICY "Managers admins can update trailer termination notes"
ON public.trailer_termination_notes FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'safety'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role)
);

CREATE POLICY "Managers admins can delete trailer termination notes"
ON public.trailer_termination_notes FOR DELETE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'safety'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_trucks_is_active ON public.trucks(is_active);
CREATE INDEX IF NOT EXISTS idx_trailers_is_active ON public.trailers(is_active);
CREATE INDEX IF NOT EXISTS idx_truck_termination_notes_truck_id ON public.truck_termination_notes(truck_id);
CREATE INDEX IF NOT EXISTS idx_trailer_termination_notes_trailer_id ON public.trailer_termination_notes(trailer_id);
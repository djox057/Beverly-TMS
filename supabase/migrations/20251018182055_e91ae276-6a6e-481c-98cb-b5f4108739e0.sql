-- Create table for tracking drug test results for new drivers
CREATE TABLE public.driver_drug_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  result TEXT CHECK (result IN ('positive', 'negative', 'pending')),
  tested_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(driver_id)
);

-- Enable RLS
ALTER TABLE public.driver_drug_tests ENABLE ROW LEVEL SECURITY;

-- Policies for safety, managers, and admins
CREATE POLICY "Safety, managers and admins can view drug tests"
ON public.driver_drug_tests
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'safety'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Safety, managers and admins can insert drug tests"
ON public.driver_drug_tests
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'safety'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Safety, managers and admins can update drug tests"
ON public.driver_drug_tests
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'safety'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Safety, managers and admins can delete drug tests"
ON public.driver_drug_tests
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'safety'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Trigger to update updated_at
CREATE TRIGGER update_driver_drug_tests_updated_at
BEFORE UPDATE ON public.driver_drug_tests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
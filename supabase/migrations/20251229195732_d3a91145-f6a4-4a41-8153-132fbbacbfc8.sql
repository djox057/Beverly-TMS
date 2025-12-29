-- Create IFTA table
CREATE TABLE public.ifta_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle text NOT NULL,
  fuel_type text NOT NULL,
  jurisdiction text NOT NULL,
  taxable_miles numeric NOT NULL DEFAULT 0,
  total_miles numeric NOT NULL DEFAULT 0,
  tax_paid_gallons numeric NOT NULL DEFAULT 0,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  uploaded_by uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ifta_records ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Dispatch and higher can view IFTA records"
ON public.ifta_records
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'supervisor'::app_role)
);

CREATE POLICY "Managers admins accounting can insert IFTA records"
ON public.ifta_records
FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

CREATE POLICY "Admins and accounting can delete IFTA records"
ON public.ifta_records
FOR DELETE
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);
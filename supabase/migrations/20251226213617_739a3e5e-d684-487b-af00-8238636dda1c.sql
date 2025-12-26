-- Create driver_expenses table
CREATE TABLE public.driver_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  truck_number TEXT,
  trailer_number TEXT,
  name TEXT NOT NULL,
  explanation TEXT NOT NULL,
  expense_date DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_date DATE,
  paid_amount NUMERIC DEFAULT 0,
  notice_1 TEXT,
  notice_2 TEXT,
  is_fixed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_expenses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Dispatch and higher can view driver expenses"
ON public.driver_expenses
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR
  has_role((SELECT auth.uid()), 'safety'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role) OR
  has_role((SELECT auth.uid()), 'chicago_management'::app_role)
);

CREATE POLICY "Managers admins accounting can insert driver expenses"
ON public.driver_expenses
FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

CREATE POLICY "Managers admins accounting can update driver expenses"
ON public.driver_expenses
FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

CREATE POLICY "Admins and accounting can delete driver expenses"
ON public.driver_expenses
FOR DELETE
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

-- Create trigger for updated_at
CREATE TRIGGER update_driver_expenses_updated_at
BEFORE UPDATE ON public.driver_expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
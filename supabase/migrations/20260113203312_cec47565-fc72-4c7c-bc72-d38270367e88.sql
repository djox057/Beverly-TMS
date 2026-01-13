-- Create dispatcher_salary_payments table to track paid salaries
CREATE TABLE public.dispatcher_salary_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  month VARCHAR(7) NOT NULL, -- format: YYYY-MM
  paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  paid_at TIMESTAMP WITH TIME ZONE,
  paid_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

-- Enable Row Level Security
ALTER TABLE public.dispatcher_salary_payments ENABLE ROW LEVEL SECURITY;

-- Create policies for admin/manager/accounting access
CREATE POLICY "Admin, managers, and accounting can view salary payments"
ON public.dispatcher_salary_payments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'manager', 'accounting', 'supervisor')
  )
);

CREATE POLICY "Admin, managers, and accounting can insert salary payments"
ON public.dispatcher_salary_payments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'manager', 'accounting', 'supervisor')
  )
);

CREATE POLICY "Admin, managers, and accounting can update salary payments"
ON public.dispatcher_salary_payments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'manager', 'accounting', 'supervisor')
  )
);

CREATE POLICY "Admin, managers, and accounting can delete salary payments"
ON public.dispatcher_salary_payments
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'manager', 'accounting', 'supervisor')
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_dispatcher_salary_payments_updated_at
BEFORE UPDATE ON public.dispatcher_salary_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
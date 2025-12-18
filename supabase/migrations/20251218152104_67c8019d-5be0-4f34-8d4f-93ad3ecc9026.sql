-- Create fuel_transactions table
CREATE TABLE public.fuel_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_number TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  transaction_number TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  location_name TEXT,
  city TEXT,
  state TEXT,
  fees NUMERIC DEFAULT 0,
  item TEXT NOT NULL,
  unit_price NUMERIC DEFAULT 0,
  quantity NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fuel_transactions_transaction_number_key UNIQUE (transaction_number)
);

-- Enable Row Level Security
ALTER TABLE public.fuel_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin, maintenance, accounting roles
CREATE POLICY "Admins can manage fuel transactions"
ON public.fuel_transactions
FOR ALL
USING (has_role((SELECT auth.uid()), 'admin'::app_role))
WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));

CREATE POLICY "Maintenance can manage fuel transactions"
ON public.fuel_transactions
FOR ALL
USING (has_role((SELECT auth.uid()), 'maintenance'::app_role))
WITH CHECK (has_role((SELECT auth.uid()), 'maintenance'::app_role));

CREATE POLICY "Accounting can manage fuel transactions"
ON public.fuel_transactions
FOR ALL
USING (has_role((SELECT auth.uid()), 'accounting'::app_role))
WITH CHECK (has_role((SELECT auth.uid()), 'accounting'::app_role));

-- Managers can view fuel transactions
CREATE POLICY "Managers can view fuel transactions"
ON public.fuel_transactions
FOR SELECT
USING (has_role((SELECT auth.uid()), 'manager'::app_role));

-- Dispatch and supervisors can view fuel transactions
CREATE POLICY "Dispatch can view fuel transactions"
ON public.fuel_transactions
FOR SELECT
USING (has_role((SELECT auth.uid()), 'dispatch'::app_role));

CREATE POLICY "Supervisors can view fuel transactions"
ON public.fuel_transactions
FOR SELECT
USING (has_role((SELECT auth.uid()), 'supervisor'::app_role));

-- Create index for common queries
CREATE INDEX idx_fuel_transactions_date ON public.fuel_transactions(transaction_date DESC);
CREATE INDEX idx_fuel_transactions_truck ON public.fuel_transactions(truck_number);
CREATE INDEX idx_fuel_transactions_driver ON public.fuel_transactions(driver_name);
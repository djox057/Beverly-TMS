-- Create table to store invoice number configuration
CREATE TABLE IF NOT EXISTS public.invoice_number_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_type TEXT UNIQUE NOT NULL,
  current_number INTEGER NOT NULL,
  last_monday DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoice_number_config ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated users to read invoice config"
ON public.invoice_number_config
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to update
CREATE POLICY "Allow authenticated users to update invoice config"
ON public.invoice_number_config
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Insert initial BF Prime United invoice number starting at 7892
-- Using the most recent Monday as the base
INSERT INTO public.invoice_number_config (statement_type, current_number, last_monday)
VALUES (
  'bf_prime_united',
  7892,
  (SELECT date_trunc('week', CURRENT_DATE)::date + INTERVAL '0 days')
)
ON CONFLICT (statement_type) DO NOTHING;

-- Add updated_at trigger
CREATE TRIGGER update_invoice_number_config_updated_at
  BEFORE UPDATE ON public.invoice_number_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
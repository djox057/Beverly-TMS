-- Insert initial invoice number config for Beverly Freight Inc
INSERT INTO public.invoice_number_config (statement_type, current_number, last_monday)
VALUES ('beverly_freight_inc', 26198, '2025-01-06'::date)
ON CONFLICT (statement_type) DO NOTHING;
-- Add invoice number config for company driver statements
INSERT INTO public.invoice_number_config (statement_type, current_number, last_monday)
VALUES ('company_driver', 23108, '2026-01-06')
ON CONFLICT (statement_type) DO NOTHING;
-- Insert invoice number configuration for BG Prime Inc starting at 1332
INSERT INTO public.invoice_number_config (statement_type, current_number, last_monday)
VALUES ('bg_prime_inc', 1332, '2025-01-01')
ON CONFLICT (statement_type) DO NOTHING;
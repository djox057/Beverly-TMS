INSERT INTO invoice_number_config (statement_type, current_number, last_monday)
VALUES ('ap_silver_trans', 547, '2025-01-01')
ON CONFLICT (statement_type) DO NOTHING;
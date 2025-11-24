-- Insert invoice number configuration for BF Prime Drivers/Trucks
-- Starting from invoice number 24209
INSERT INTO invoice_number_config (statement_type, current_number, last_monday)
VALUES ('bf_prime_drivers', 24209, CURRENT_DATE - INTERVAL '1 week')
ON CONFLICT (statement_type) DO NOTHING;
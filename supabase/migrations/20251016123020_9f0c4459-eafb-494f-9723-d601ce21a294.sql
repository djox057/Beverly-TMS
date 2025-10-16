-- Add driver-specific accessorial charge columns to orders table
ALTER TABLE orders
ADD COLUMN detention_driver numeric DEFAULT 0,
ADD COLUMN layover_driver numeric DEFAULT 0,
ADD COLUMN extra_stop_driver numeric DEFAULT 0,
ADD COLUMN lumper_driver numeric DEFAULT 0,
ADD COLUMN late_fee_driver numeric DEFAULT 0,
ADD COLUMN tonu_driver numeric DEFAULT 0;

-- Add comments for clarity
COMMENT ON COLUMN orders.detention IS 'Detention amount paid by company (broker to carrier)';
COMMENT ON COLUMN orders.detention_driver IS 'Detention amount paid to driver';
COMMENT ON COLUMN orders.layover IS 'Layover amount paid by company (broker to carrier)';
COMMENT ON COLUMN orders.layover_driver IS 'Layover amount paid to driver';
COMMENT ON COLUMN orders.extra_stop IS 'Extra stop amount paid by company (broker to carrier)';
COMMENT ON COLUMN orders.extra_stop_driver IS 'Extra stop amount paid to driver';
COMMENT ON COLUMN orders.lumper IS 'Lumper amount paid by company (broker to carrier)';
COMMENT ON COLUMN orders.lumper_driver IS 'Lumper amount paid to driver';
COMMENT ON COLUMN orders.late_fee IS 'Late fee amount paid by company (broker to carrier)';
COMMENT ON COLUMN orders.late_fee_driver IS 'Late fee amount paid to driver';
COMMENT ON COLUMN orders.tonu IS 'TONU amount paid by company (broker to carrier)';
COMMENT ON COLUMN orders.tonu_driver IS 'TONU amount paid to driver';
-- Add additional_miles, other_charges_reason, other_additionals, and other_additionals_driver with reason fields
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS additional_miles INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_charges_reason TEXT,
ADD COLUMN IF NOT EXISTS other_additionals NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_additionals_driver NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_additionals_reason TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.orders.additional_miles IS 'Additional miles to add to loaded miles for mileage calculation';
COMMENT ON COLUMN public.orders.other_charges_reason IS 'Reason for other charges';
COMMENT ON COLUMN public.orders.other_additionals IS 'Other additional charges for company';
COMMENT ON COLUMN public.orders.other_additionals_driver IS 'Other additional charges for driver';
COMMENT ON COLUMN public.orders.other_additionals_reason IS 'Reason for other additional charges';
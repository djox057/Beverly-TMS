-- Add commodity, weight, and reference fields to orders table
ALTER TABLE public.orders
ADD COLUMN commodity text,
ADD COLUMN weight numeric,
ADD COLUMN reference_number text,
ADD COLUMN po_number text,
ADD COLUMN pu_number text;

-- Add company/facility name to pickup_drops for shipper/receiver names
ALTER TABLE public.pickup_drops
ADD COLUMN company_name text;

-- Add comments for clarity
COMMENT ON COLUMN orders.commodity IS 'Type of goods being transported';
COMMENT ON COLUMN orders.weight IS 'Weight of the shipment';
COMMENT ON COLUMN orders.reference_number IS 'General reference number';
COMMENT ON COLUMN orders.po_number IS 'Purchase order number';
COMMENT ON COLUMN orders.pu_number IS 'Pickup number';
COMMENT ON COLUMN pickup_drops.company_name IS 'Company/facility name (shipper for pickups, receiver for deliveries)';
-- Add partial load support to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS partial_broker_loads JSONB,
ADD COLUMN IF NOT EXISTS partial_brokers JSONB,
ADD COLUMN IF NOT EXISTS partial_booked_by_companies JSONB;

-- Add comment for documentation
COMMENT ON COLUMN public.orders.is_partial IS 'Indicates if this order is a partial load (multiple broker loads on one truck)';
COMMENT ON COLUMN public.orders.partial_broker_loads IS 'Array of broker load numbers for partial loads: ["LOAD1", "LOAD2", "LOAD3"]';
COMMENT ON COLUMN public.orders.partial_brokers IS 'Array of broker IDs for partial loads';
COMMENT ON COLUMN public.orders.partial_booked_by_companies IS 'Array of booked by company IDs for partial loads';
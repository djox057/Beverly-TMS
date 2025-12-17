-- Add transfer location and datetime columns to order_transfers table
ALTER TABLE public.order_transfers 
ADD COLUMN transfer_city TEXT,
ADD COLUMN transfer_state TEXT,
ADD COLUMN transfer_address TEXT,
ADD COLUMN transfer_datetime TIMESTAMP WITH TIME ZONE,
ADD COLUMN transfer_latitude NUMERIC,
ADD COLUMN transfer_longitude NUMERIC;

-- Add comment to explain the purpose
COMMENT ON COLUMN public.order_transfers.transfer_city IS 'City where the transfer/handoff occurred';
COMMENT ON COLUMN public.order_transfers.transfer_state IS 'State where the transfer/handoff occurred';
COMMENT ON COLUMN public.order_transfers.transfer_address IS 'Full address where the transfer/handoff occurred';
COMMENT ON COLUMN public.order_transfers.transfer_datetime IS 'When the transfer/handoff occurred';
COMMENT ON COLUMN public.order_transfers.transfer_latitude IS 'Latitude of transfer location';
COMMENT ON COLUMN public.order_transfers.transfer_longitude IS 'Longitude of transfer location';
-- Fix integer columns that should accept decimal values
-- This is causing thousands of database errors and high CPU usage

-- Orders table - change mileage columns from integer to numeric
ALTER TABLE public.orders 
  ALTER COLUMN mileage TYPE numeric(10,2),
  ALTER COLUMN loaded_miles TYPE numeric(10,2),
  ALTER COLUMN dh_miles TYPE numeric(10,2),
  ALTER COLUMN original_miles TYPE numeric(10,2),
  ALTER COLUMN recovery_miles TYPE numeric(10,2);

-- Trucks table - change miles_away from integer to numeric
ALTER TABLE public.trucks 
  ALTER COLUMN miles_away TYPE numeric(10,2);

-- Trailers table - change capacity if needed
ALTER TABLE public.trailers 
  ALTER COLUMN capacity TYPE numeric(10,2);

-- Add indexes for frequently queried columns to improve performance
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_truck_id ON public.orders(truck_id);
CREATE INDEX IF NOT EXISTS idx_orders_internal_load_number ON public.orders(internal_load_number);
CREATE INDEX IF NOT EXISTS idx_pickup_drops_order_id_type ON public.pickup_drops(order_id, type);
CREATE INDEX IF NOT EXISTS idx_order_files_order_id_category ON public.order_files(order_id, file_category);
CREATE INDEX IF NOT EXISTS idx_trucks_status ON public.trucks(status);
CREATE INDEX IF NOT EXISTS idx_trucks_truck_number ON public.trucks(truck_number);

-- Add indexes on geocoding and route cache for faster lookups
CREATE INDEX IF NOT EXISTS idx_geocoding_cache_address ON public.geocoding_cache(address);
CREATE INDEX IF NOT EXISTS idx_route_cache_coords ON public.route_cache(start_lat, start_lon, end_lat, end_lon);

COMMENT ON COLUMN public.orders.mileage IS 'Total mileage in decimal format';
COMMENT ON COLUMN public.orders.loaded_miles IS 'Loaded miles in decimal format';
COMMENT ON COLUMN public.orders.dh_miles IS 'Deadhead miles in decimal format';
COMMENT ON COLUMN public.trucks.miles_away IS 'Distance from truck to destination in decimal format';
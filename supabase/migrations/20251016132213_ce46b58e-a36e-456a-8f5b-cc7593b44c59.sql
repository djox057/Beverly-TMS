-- Add missing indexes to optimize slow queries

-- Orders table indexes (used heavily in joins)
CREATE INDEX IF NOT EXISTS idx_orders_truck_id ON public.orders(truck_id) WHERE truck_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_driver1_id ON public.orders(driver1_id) WHERE driver1_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_driver2_id ON public.orders(driver2_id) WHERE driver2_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_broker_id ON public.orders(broker_id) WHERE broker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_company_id ON public.orders(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_booked_by_company_id ON public.orders(booked_by_company_id) WHERE booked_by_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_canceled ON public.orders(status, canceled) WHERE NOT canceled;

-- Pickup_drops table indexes
CREATE INDEX IF NOT EXISTS idx_pickup_drops_order_id ON public.pickup_drops(order_id);
CREATE INDEX IF NOT EXISTS idx_pickup_drops_datetime ON public.pickup_drops(datetime);

-- Order_files table indexes
CREATE INDEX IF NOT EXISTS idx_order_files_order_id ON public.order_files(order_id);
CREATE INDEX IF NOT EXISTS idx_order_files_category ON public.order_files(file_category);

-- Trucks table indexes
CREATE INDEX IF NOT EXISTS idx_trucks_driver1_id ON public.trucks(driver1_id) WHERE driver1_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trucks_driver2_id ON public.trucks(driver2_id) WHERE driver2_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trucks_trailer_id ON public.trucks(trailer_id) WHERE trailer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trucks_dispatcher_id ON public.trucks(dispatcher_id) WHERE dispatcher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trucks_company_id ON public.trucks(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trucks_updated_at_desc ON public.trucks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_trucks_status ON public.trucks(status);

-- Drivers table indexes
CREATE INDEX IF NOT EXISTS idx_drivers_email ON public.drivers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drivers_is_active ON public.drivers(is_active) WHERE is_active = true;

-- Brokers table indexes
CREATE INDEX IF NOT EXISTS idx_brokers_name ON public.brokers(name);

-- Trailers table indexes
CREATE INDEX IF NOT EXISTS idx_trailers_status ON public.trailers(status);

-- Profiles table indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_orders_truck_status ON public.orders(truck_id, status, canceled) WHERE truck_id IS NOT NULL AND NOT canceled;
CREATE INDEX IF NOT EXISTS idx_orders_driver_status ON public.orders(driver1_id, status, canceled) WHERE driver1_id IS NOT NULL AND NOT canceled;
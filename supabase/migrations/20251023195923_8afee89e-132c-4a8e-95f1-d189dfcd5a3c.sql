-- Add indexes to frequently queried columns to reduce Disk IO

-- Orders table indexes (most queried table)
CREATE INDEX IF NOT EXISTS idx_orders_internal_load_number ON orders(internal_load_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_company_id ON orders(company_id);
CREATE INDEX IF NOT EXISTS idx_orders_truck_id ON orders(truck_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver1_id ON orders(driver1_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver2_id ON orders(driver2_id);
CREATE INDEX IF NOT EXISTS idx_orders_broker_id ON orders(broker_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_datetime ON orders(pickup_datetime);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_datetime ON orders(delivery_datetime);

-- Trucks table indexes
CREATE INDEX IF NOT EXISTS idx_trucks_truck_number ON trucks(truck_number);
CREATE INDEX IF NOT EXISTS idx_trucks_company_id ON trucks(company_id);
CREATE INDEX IF NOT EXISTS idx_trucks_driver1_id ON trucks(driver1_id);
CREATE INDEX IF NOT EXISTS idx_trucks_status ON trucks(status);

-- Drivers table indexes
CREATE INDEX IF NOT EXISTS idx_drivers_email ON drivers(email);
CREATE INDEX IF NOT EXISTS idx_drivers_dispatcher_id ON drivers(dispatcher_id);
CREATE INDEX IF NOT EXISTS idx_drivers_is_active ON drivers(is_active);

-- Trailers table indexes
CREATE INDEX IF NOT EXISTS idx_trailers_trailer_number ON trailers(trailer_number);
CREATE INDEX IF NOT EXISTS idx_trailers_status ON trailers(status);

-- Truck locations indexes
CREATE INDEX IF NOT EXISTS idx_truck_locations_truck_id_timestamp ON truck_locations(truck_id, location_timestamp DESC);

-- Order files indexes
CREATE INDEX IF NOT EXISTS idx_order_files_order_id ON order_files(order_id);

-- Driver files indexes
CREATE INDEX IF NOT EXISTS idx_driver_files_driver_id ON driver_files(driver_id);

-- Truck files indexes
CREATE INDEX IF NOT EXISTS idx_truck_files_truck_id ON truck_files(truck_id);

-- Trailer files indexes
CREATE INDEX IF NOT EXISTS idx_trailer_files_trailer_id ON trailer_files(trailer_id);

-- User roles indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
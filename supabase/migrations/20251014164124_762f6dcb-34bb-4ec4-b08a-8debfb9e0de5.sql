-- ====================================
-- PERFORMANCE OPTIMIZATION: Add Missing Indexes
-- ====================================

-- Orders table indexes (most critical - heavily queried)
CREATE INDEX IF NOT EXISTS idx_orders_company_id ON orders(company_id);
CREATE INDEX IF NOT EXISTS idx_orders_booked_by_company_id ON orders(booked_by_company_id);
CREATE INDEX IF NOT EXISTS idx_orders_broker_id ON orders(broker_id);
CREATE INDEX IF NOT EXISTS idx_orders_truck_id ON orders(truck_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver1_id ON orders(driver1_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver2_id ON orders(driver2_id);
CREATE INDEX IF NOT EXISTS idx_orders_trailer_id ON orders(trailer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_invoiced ON orders(invoiced);
CREATE INDEX IF NOT EXISTS idx_orders_locked ON orders(locked);
CREATE INDEX IF NOT EXISTS idx_orders_canceled ON orders(canceled);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_datetime ON orders(pickup_datetime);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_datetime ON orders(delivery_datetime);
CREATE INDEX IF NOT EXISTS idx_orders_internal_load_number ON orders(internal_load_number);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_orders_truck_status ON orders(truck_id, status) WHERE truck_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_driver_status ON orders(driver1_id, status) WHERE driver1_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_company_status ON orders(company_id, status);

-- Pickup/Drops indexes
CREATE INDEX IF NOT EXISTS idx_pickup_drops_order_id ON pickup_drops(order_id);
CREATE INDEX IF NOT EXISTS idx_pickup_drops_type ON pickup_drops(type);
CREATE INDEX IF NOT EXISTS idx_pickup_drops_datetime ON pickup_drops(datetime);
CREATE INDEX IF NOT EXISTS idx_pickup_drops_sequence ON pickup_drops(order_id, sequence_number);

-- Order Files indexes
CREATE INDEX IF NOT EXISTS idx_order_files_order_id ON order_files(order_id);
CREATE INDEX IF NOT EXISTS idx_order_files_category ON order_files(file_category);
CREATE INDEX IF NOT EXISTS idx_order_files_created_at ON order_files(created_at);

-- Trucks table indexes
CREATE INDEX IF NOT EXISTS idx_trucks_trailer_id ON trucks(trailer_id);
CREATE INDEX IF NOT EXISTS idx_trucks_driver1_id ON trucks(driver1_id);
CREATE INDEX IF NOT EXISTS idx_trucks_driver2_id ON trucks(driver2_id);
CREATE INDEX IF NOT EXISTS idx_trucks_dispatcher_id ON trucks(dispatcher_id);
CREATE INDEX IF NOT EXISTS idx_trucks_company_id ON trucks(company_id);
CREATE INDEX IF NOT EXISTS idx_trucks_status ON trucks(status);
CREATE INDEX IF NOT EXISTS idx_trucks_truck_number ON trucks(truck_number);

-- Drivers table indexes
CREATE INDEX IF NOT EXISTS idx_drivers_is_active ON drivers(is_active);
CREATE INDEX IF NOT EXISTS idx_drivers_email ON drivers(email);
CREATE INDEX IF NOT EXISTS idx_drivers_hos_last_updated ON drivers(hos_last_updated);

-- Trailers table indexes
CREATE INDEX IF NOT EXISTS idx_trailers_status ON trailers(status);
CREATE INDEX IF NOT EXISTS idx_trailers_trailer_number ON trailers(trailer_number);

-- Truck Notes indexes
CREATE INDEX IF NOT EXISTS idx_truck_notes_truck_id ON truck_notes(truck_id);
CREATE INDEX IF NOT EXISTS idx_truck_notes_updated_by ON truck_notes(updated_by);
CREATE INDEX IF NOT EXISTS idx_truck_notes_created_at ON truck_notes(created_at);

-- Lost Day Notes indexes
CREATE INDEX IF NOT EXISTS idx_lost_day_notes_truck_id ON lost_day_notes(truck_id);
CREATE INDEX IF NOT EXISTS idx_lost_day_notes_date ON lost_day_notes(date);
CREATE INDEX IF NOT EXISTS idx_lost_day_notes_updated_by ON lost_day_notes(updated_by);

-- Truck Files indexes
CREATE INDEX IF NOT EXISTS idx_truck_files_truck_id ON truck_files(truck_id);
CREATE INDEX IF NOT EXISTS idx_truck_files_created_at ON truck_files(created_at);

-- Driver Files indexes
CREATE INDEX IF NOT EXISTS idx_driver_files_driver_id ON driver_files(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_files_created_at ON driver_files(created_at);

-- Driver Performance indexes
CREATE INDEX IF NOT EXISTS idx_driver_performance_driver_name ON driver_performance(driver_name);
CREATE INDEX IF NOT EXISTS idx_driver_performance_created_at ON driver_performance(created_at);

-- Driver PII Audit Log indexes
CREATE INDEX IF NOT EXISTS idx_driver_pii_audit_driver_id ON driver_pii_audit_log(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_pii_audit_accessed_by ON driver_pii_audit_log(accessed_by);
CREATE INDEX IF NOT EXISTS idx_driver_pii_audit_accessed_at ON driver_pii_audit_log(accessed_at);
CREATE INDEX IF NOT EXISTS idx_driver_pii_audit_operation ON driver_pii_audit_log(operation);

-- User Roles indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_office ON profiles(office);

-- Dispatcher Status indexes
CREATE INDEX IF NOT EXISTS idx_dispatcher_status_dispatcher_id ON dispatcher_status(dispatcher_id);
CREATE INDEX IF NOT EXISTS idx_dispatcher_status_is_active ON dispatcher_status(is_active);

-- Brokers indexes
CREATE INDEX IF NOT EXISTS idx_brokers_name ON brokers(name);
CREATE INDEX IF NOT EXISTS idx_brokers_mc_number ON brokers(mc_number);

-- Companies indexes
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);

-- Add comments for documentation
COMMENT ON INDEX idx_orders_truck_status IS 'Optimizes queries filtering orders by truck and status';
COMMENT ON INDEX idx_orders_driver_status IS 'Optimizes queries filtering orders by driver and status';
COMMENT ON INDEX idx_orders_company_status IS 'Optimizes queries filtering orders by company and status';
COMMENT ON INDEX idx_pickup_drops_sequence IS 'Optimizes multi-stop route queries';

-- Analyze tables to update statistics after creating indexes
ANALYZE orders;
ANALYZE pickup_drops;
ANALYZE trucks;
ANALYZE drivers;
ANALYZE trailers;
ANALYZE order_files;
ANALYZE brokers;
ANALYZE companies;
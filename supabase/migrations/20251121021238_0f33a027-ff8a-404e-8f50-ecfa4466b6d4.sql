-- Create the new orders_view_cache table by copying structure from materialized view
CREATE TABLE public.orders_view_cache AS 
SELECT * FROM orders_materialized_view LIMIT 0;

-- Add primary key
ALTER TABLE public.orders_view_cache ADD PRIMARY KEY (id);

-- Create indexes for performance
CREATE INDEX idx_orders_cache_truck_id ON orders_view_cache(truck_id);
CREATE INDEX idx_orders_cache_driver1_id ON orders_view_cache(driver1_id);
CREATE INDEX idx_orders_cache_pickup_datetime ON orders_view_cache(pickup_datetime);
CREATE INDEX idx_orders_cache_delivery_datetime ON orders_view_cache(delivery_datetime);

-- Create function to refresh a single order in the cache
CREATE OR REPLACE FUNCTION public.refresh_order_cache(order_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete existing cache entry
  DELETE FROM orders_view_cache WHERE id = order_id_param;
  
  -- Insert fresh data from materialized view
  INSERT INTO orders_view_cache
  SELECT * FROM orders_materialized_view WHERE id = order_id_param;
END;
$$;

-- Trigger function for orders table
CREATE OR REPLACE FUNCTION public.trigger_refresh_order_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM orders_view_cache WHERE id = OLD.id;
    RETURN OLD;
  ELSIF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    PERFORM refresh_order_cache(NEW.id);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Trigger function for related tables
CREATE OR REPLACE FUNCTION public.trigger_refresh_related_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_id_to_refresh uuid;
BEGIN
  IF TG_TABLE_NAME = 'trucks' THEN
    FOR order_id_to_refresh IN 
      SELECT id FROM orders WHERE truck_id = COALESCE(NEW.id, OLD.id) OR original_truck_id = COALESCE(NEW.id, OLD.id)
    LOOP
      PERFORM refresh_order_cache(order_id_to_refresh);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'trailers' THEN
    FOR order_id_to_refresh IN 
      SELECT id FROM orders WHERE trailer_id = COALESCE(NEW.id, OLD.id) OR original_trailer_id = COALESCE(NEW.id, OLD.id)
    LOOP
      PERFORM refresh_order_cache(order_id_to_refresh);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'drivers' THEN
    FOR order_id_to_refresh IN 
      SELECT id FROM orders WHERE driver1_id = COALESCE(NEW.id, OLD.id) OR driver2_id = COALESCE(NEW.id, OLD.id) 
        OR original_driver1_id = COALESCE(NEW.id, OLD.id) OR original_driver2_id = COALESCE(NEW.id, OLD.id)
    LOOP
      PERFORM refresh_order_cache(order_id_to_refresh);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'brokers' THEN
    FOR order_id_to_refresh IN 
      SELECT id FROM orders WHERE broker_id = COALESCE(NEW.id, OLD.id)
    LOOP
      PERFORM refresh_order_cache(order_id_to_refresh);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'companies' THEN
    FOR order_id_to_refresh IN 
      SELECT o.id FROM orders o 
      LEFT JOIN trucks t ON o.truck_id = t.id 
      WHERE o.company_id = COALESCE(NEW.id, OLD.id) 
        OR o.booked_by_company_id = COALESCE(NEW.id, OLD.id)
        OR t.company_id = COALESCE(NEW.id, OLD.id)
    LOOP
      PERFORM refresh_order_cache(order_id_to_refresh);
    END LOOP;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger function for pickup_drops and order_files
CREATE OR REPLACE FUNCTION public.trigger_refresh_order_from_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM refresh_order_cache(OLD.order_id);
    RETURN OLD;
  ELSE
    PERFORM refresh_order_cache(NEW.order_id);
    RETURN NEW;
  END IF;
END;
$$;

-- Create triggers
CREATE TRIGGER refresh_order_cache_on_order_change
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_order_cache();

CREATE TRIGGER refresh_order_cache_on_truck_change
  AFTER INSERT OR UPDATE OR DELETE ON trucks
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_related_orders();

CREATE TRIGGER refresh_order_cache_on_trailer_change
  AFTER INSERT OR UPDATE OR DELETE ON trailers
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_related_orders();

CREATE TRIGGER refresh_order_cache_on_driver_change
  AFTER INSERT OR UPDATE OR DELETE ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_related_orders();

CREATE TRIGGER refresh_order_cache_on_broker_change
  AFTER INSERT OR UPDATE OR DELETE ON brokers
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_related_orders();

CREATE TRIGGER refresh_order_cache_on_company_change
  AFTER INSERT OR UPDATE OR DELETE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_related_orders();

CREATE TRIGGER refresh_order_cache_on_pickup_drop_change
  AFTER INSERT OR UPDATE OR DELETE ON pickup_drops
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_order_from_child();

CREATE TRIGGER refresh_order_cache_on_order_file_change
  AFTER INSERT OR UPDATE OR DELETE ON order_files
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_order_from_child();

-- Initial population from materialized view
INSERT INTO orders_view_cache SELECT * FROM orders_materialized_view;

-- Enable RLS
ALTER TABLE orders_view_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Chicago Management can view orders cache"
  ON orders_view_cache FOR SELECT
  USING (has_role(auth.uid(), 'chicago_management'::app_role));

CREATE POLICY "Dispatch and higher can view orders cache"
  ON orders_view_cache FOR SELECT
  USING (
    has_role(auth.uid(), 'dispatch'::app_role) OR
    has_role(auth.uid(), 'afterhours'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'accounting'::app_role) OR
    has_role(auth.uid(), 'supervisor'::app_role)
  );

CREATE POLICY "Maintenance can view orders cache"
  ON orders_view_cache FOR SELECT
  USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Safety can view orders cache"
  ON orders_view_cache FOR SELECT
  USING (has_role(auth.uid(), 'safety'::app_role));

CREATE POLICY "Drivers can view their orders cache"
  ON orders_view_cache FOR SELECT
  USING (
    driver1_id IN (
      SELECT d.id FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    )
    OR driver2_id IN (
      SELECT d.id FROM drivers d
      JOIN profiles p ON p.email = d.email
      WHERE p.user_id = auth.uid() AND has_role(p.user_id, 'driver'::app_role)
    )
  );

-- Delete the cron job
SELECT cron.unschedule('refresh-orders-materialized-view');
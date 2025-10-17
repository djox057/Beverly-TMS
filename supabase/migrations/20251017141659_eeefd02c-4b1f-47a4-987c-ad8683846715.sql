-- Add recovery columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_recovery BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_driver1_id UUID REFERENCES drivers(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_driver2_id UUID REFERENCES drivers(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_truck_id UUID REFERENCES trucks(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_trailer_id UUID REFERENCES trailers(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_miles INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_freight_amount NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_driver_price NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recovery_miles INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recovery_freight_amount NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recovery_driver_price NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recovery_date TIMESTAMP WITH TIME ZONE;

-- Add RLS policy for recovery operations (managers, supervisors, and admins only)
CREATE POLICY "Managers, supervisors and admins can mark loads as recovery"
ON orders
FOR UPDATE
USING (
  (has_role(auth.uid(), 'manager'::app_role) OR 
   has_role(auth.uid(), 'supervisor'::app_role) OR 
   has_role(auth.uid(), 'admin'::app_role)) AND
  (locked = false)
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);
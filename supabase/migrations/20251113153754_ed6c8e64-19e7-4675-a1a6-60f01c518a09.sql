-- Add company_id to drivers table
ALTER TABLE drivers 
ADD COLUMN company_id UUID REFERENCES companies(id);

-- Migrate data: Set driver's company based on their current truck
UPDATE drivers d
SET company_id = t.company_id
FROM trucks t
WHERE t.driver1_id = d.id 
  AND t.company_id IS NOT NULL;

-- Create index for performance
CREATE INDEX idx_drivers_company_id ON drivers(company_id);

-- Update RLS policies for driver company access
CREATE POLICY "Authenticated users can view driver companies"
ON drivers FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'afterhours'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role) OR
  has_role(auth.uid(), 'safety'::app_role) OR
  has_role(auth.uid(), 'maintenance'::app_role)
);
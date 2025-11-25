-- Drop existing policies for driver_yard_actions
DROP POLICY IF EXISTS "Dispatch and higher can view driver yard actions" ON driver_yard_actions;
DROP POLICY IF EXISTS "Managers, admins and maintenance can update driver yard actions" ON driver_yard_actions;
DROP POLICY IF EXISTS "Dispatch and higher can create driver yard actions" ON driver_yard_actions;

-- Allow all authenticated users to view yard arrivals
CREATE POLICY "All authenticated users can view driver yard actions"
ON driver_yard_actions
FOR SELECT
TO authenticated
USING (true);

-- Allow all authenticated users to edit yard arrivals
CREATE POLICY "All authenticated users can update driver yard actions"
ON driver_yard_actions
FOR UPDATE
TO authenticated
USING (true);

-- Allow all authenticated users to create yard arrivals
CREATE POLICY "All authenticated users can create driver yard actions"
ON driver_yard_actions
FOR INSERT
TO authenticated
WITH CHECK (true);
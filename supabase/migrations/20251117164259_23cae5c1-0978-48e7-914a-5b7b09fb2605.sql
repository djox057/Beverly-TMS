-- Add SELECT policies for chicago_management role across all tables

-- Assignment history
CREATE POLICY "Chicago Management can view assignment history"
ON assignment_history
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Brokers
CREATE POLICY "Chicago Management can view brokers"
ON brokers
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Companies
CREATE POLICY "Chicago Management can view companies"
ON companies
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Company files
CREATE POLICY "Chicago Management can view company files"
ON company_files
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Dispatcher daily driver counts
CREATE POLICY "Chicago Management can view dispatcher daily counts"
ON dispatcher_daily_driver_counts
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Dispatcher status
CREATE POLICY "Chicago Management can view dispatcher status"
ON dispatcher_status
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Drivers
CREATE POLICY "Chicago Management can view drivers"
ON drivers
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Driver files
CREATE POLICY "Chicago Management can view driver files"
ON driver_files
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Driver performance
CREATE POLICY "Chicago Management can view driver performance"
ON driver_performance
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Driver drug tests
CREATE POLICY "Chicago Management can view driver drug tests"
ON driver_drug_tests
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Driver sensitive PII
CREATE POLICY "Chicago Management can view driver sensitive PII"
ON driver_sensitive_pii
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Driver PII audit logs
CREATE POLICY "Chicago Management can view PII audit logs"
ON driver_pii_audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Driver termination notes
CREATE POLICY "Chicago Management can view driver termination notes"
ON driver_termination_notes
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Lost day notes
CREATE POLICY "Chicago Management can view lost day notes"
ON lost_day_notes
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Orders
CREATE POLICY "Chicago Management can view orders"
ON orders
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Order files
CREATE POLICY "Chicago Management can view order files"
ON order_files
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Pickup drops
CREATE POLICY "Chicago Management can view pickup drops"
ON pickup_drops
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Profiles
CREATE POLICY "Chicago Management can view profiles"
ON profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Recovery history
CREATE POLICY "Chicago Management can view recovery history"
ON recovery_history
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Trailers
CREATE POLICY "Chicago Management can view trailers"
ON trailers
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Trailer files
CREATE POLICY "Chicago Management can view trailer files"
ON trailer_files
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Trucks
CREATE POLICY "Chicago Management can view trucks"
ON trucks
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Truck files
CREATE POLICY "Chicago Management can view truck files"
ON truck_files
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Truck locations
CREATE POLICY "Chicago Management can view truck locations"
ON truck_locations
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Truck notes
CREATE POLICY "Chicago Management can view truck notes"
ON truck_notes
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Truck note history
CREATE POLICY "Chicago Management can view truck note history"
ON truck_note_history
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));

-- Canceled orders backup
CREATE POLICY "Chicago Management can view canceled orders backup"
ON canceled_orders_backup
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));
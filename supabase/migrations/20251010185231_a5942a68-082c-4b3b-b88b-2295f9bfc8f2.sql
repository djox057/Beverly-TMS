-- Brokers table policies for maintenance
CREATE POLICY "Maintenance can view brokers"
ON public.brokers
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update brokers"
ON public.brokers
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Companies table policies for maintenance
CREATE POLICY "Maintenance can view companies"
ON public.companies
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update companies"
ON public.companies
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Driver files table policies for maintenance
CREATE POLICY "Maintenance can view driver_files"
ON public.driver_files
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can create driver_files"
ON public.driver_files
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update driver_files"
ON public.driver_files
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Driver performance table policies for maintenance
CREATE POLICY "Maintenance can view driver performance"
ON public.driver_performance
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can create driver performance"
ON public.driver_performance
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update driver performance"
ON public.driver_performance
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Driver sensitive PII table policies for maintenance
CREATE POLICY "Maintenance can view driver sensitive PII"
ON public.driver_sensitive_pii
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can create driver sensitive PII"
ON public.driver_sensitive_pii
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update driver sensitive PII"
ON public.driver_sensitive_pii
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Drivers table policies for maintenance
CREATE POLICY "Maintenance can view drivers"
ON public.drivers
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can create drivers"
ON public.drivers
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update drivers"
ON public.drivers
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Lost day notes table policies for maintenance
CREATE POLICY "Maintenance can view lost day notes"
ON public.lost_day_notes
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can create lost day notes"
ON public.lost_day_notes
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update lost day notes"
ON public.lost_day_notes
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Order files table policies for maintenance
CREATE POLICY "Maintenance can view order_files"
ON public.order_files
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can create order_files"
ON public.order_files
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update order_files"
ON public.order_files
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Orders table policies for maintenance
CREATE POLICY "Maintenance can view all orders"
ON public.orders
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update all orders"
ON public.orders
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role))
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

-- Pickup drops table policies for maintenance
CREATE POLICY "Maintenance can view pickup_drops"
ON public.pickup_drops
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can create pickup_drops"
ON public.pickup_drops
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update pickup_drops"
ON public.pickup_drops
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Profiles table policies for maintenance
CREATE POLICY "Maintenance can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Trailer files table policies for maintenance
CREATE POLICY "Maintenance can view trailer_files"
ON public.trailer_files
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can create trailer_files"
ON public.trailer_files
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update trailer_files"
ON public.trailer_files
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Trailers table policies for maintenance
CREATE POLICY "Maintenance can view trailers"
ON public.trailers
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can create trailers"
ON public.trailers
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update trailers"
ON public.trailers
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Truck files table policies for maintenance
CREATE POLICY "Maintenance can view truck_files"
ON public.truck_files
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can create truck_files"
ON public.truck_files
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update truck_files"
ON public.truck_files
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Truck locations table policies for maintenance
CREATE POLICY "Maintenance can view truck locations"
ON public.truck_locations
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

-- Truck notes table policies for maintenance
CREATE POLICY "Maintenance can view truck notes"
ON public.truck_notes
FOR SELECT
USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can create truck notes"
ON public.truck_notes
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update truck notes"
ON public.truck_notes
FOR UPDATE
USING (has_role(auth.uid(), 'maintenance'::app_role));
-- Add RLS policies for supervisor role (same permissions as manager)

-- Brokers table
CREATE POLICY "Supervisors can view brokers" 
ON public.brokers 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create brokers" 
ON public.brokers 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update brokers" 
ON public.brokers 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Companies table
CREATE POLICY "Supervisors can view companies" 
ON public.companies 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update companies" 
ON public.companies 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Drivers table
CREATE POLICY "Supervisors can view drivers" 
ON public.drivers 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create drivers" 
ON public.drivers 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update drivers" 
ON public.drivers 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can delete drivers" 
ON public.drivers 
FOR DELETE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Driver files table
CREATE POLICY "Supervisors can view driver_files" 
ON public.driver_files 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create driver_files" 
ON public.driver_files 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update driver_files" 
ON public.driver_files 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Driver sensitive PII table
CREATE POLICY "Supervisors can view driver sensitive PII" 
ON public.driver_sensitive_pii 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create driver sensitive PII" 
ON public.driver_sensitive_pii 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update driver sensitive PII" 
ON public.driver_sensitive_pii 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Lost day notes table
CREATE POLICY "Supervisors can view lost day notes" 
ON public.lost_day_notes 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create lost day notes" 
ON public.lost_day_notes 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update lost day notes" 
ON public.lost_day_notes 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Orders table
CREATE POLICY "Supervisors can view orders" 
ON public.orders 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update orders" 
ON public.orders 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role))
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create orders" 
ON public.orders 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

-- Order files table
CREATE POLICY "Supervisors can view order_files" 
ON public.order_files 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create order_files" 
ON public.order_files 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update order_files" 
ON public.order_files 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Pickup drops table
CREATE POLICY "Supervisors can view pickup_drops" 
ON public.pickup_drops 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create pickup_drops" 
ON public.pickup_drops 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update pickup_drops" 
ON public.pickup_drops 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Trailers table
CREATE POLICY "Supervisors can view trailers" 
ON public.trailers 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create trailers" 
ON public.trailers 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update trailers" 
ON public.trailers 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Trailer files table
CREATE POLICY "Supervisors can view trailer_files" 
ON public.trailer_files 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create trailer_files" 
ON public.trailer_files 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update trailer_files" 
ON public.trailer_files 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Trucks table
CREATE POLICY "Supervisors can view trucks" 
ON public.trucks 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create trucks" 
ON public.trucks 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update trucks" 
ON public.trucks 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Truck files table
CREATE POLICY "Supervisors can view truck_files" 
ON public.truck_files 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create truck_files" 
ON public.truck_files 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update truck_files" 
ON public.truck_files 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Truck locations table
CREATE POLICY "Supervisors can view truck locations" 
ON public.truck_locations 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Truck notes table
CREATE POLICY "Supervisors can view truck notes" 
ON public.truck_notes 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can create truck notes" 
ON public.truck_notes 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Supervisors can update truck notes" 
ON public.truck_notes 
FOR UPDATE 
USING (has_role(auth.uid(), 'supervisor'::app_role));
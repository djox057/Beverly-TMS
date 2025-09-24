-- Phase 1: Critical Security Fixes - Replace Public RLS Policies with Authentication-Based Access Control

-- Drop existing overly permissive policies that allow public access
DROP POLICY IF EXISTS "Allow all operations on brokers" ON public.brokers;
DROP POLICY IF EXISTS "Allow all operations on companies" ON public.companies;
DROP POLICY IF EXISTS "Allow all operations on drivers" ON public.drivers;
DROP POLICY IF EXISTS "Allow all operations on order_files" ON public.order_files;
DROP POLICY IF EXISTS "Allow all operations on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow all operations on pickup_drops" ON public.pickup_drops;
DROP POLICY IF EXISTS "Allow all operations on trailers" ON public.trailers;
DROP POLICY IF EXISTS "Allow all operations on trucks" ON public.trucks;

-- BROKERS TABLE: Authenticated users only
CREATE POLICY "Authenticated users can view brokers" ON public.brokers
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create brokers" ON public.brokers
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update brokers" ON public.brokers
FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Admins can delete brokers" ON public.brokers
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- COMPANIES TABLE: Authenticated users only
CREATE POLICY "Authenticated users can view companies" ON public.companies
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create companies" ON public.companies
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update companies" ON public.companies
FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Admins can delete companies" ON public.companies
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- DRIVERS TABLE: Manager/Admin roles only (contains PII)
CREATE POLICY "Managers and admins can view drivers" ON public.drivers
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers and admins can create drivers" ON public.drivers
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers and admins can update drivers" ON public.drivers
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admins can delete drivers" ON public.drivers
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ORDERS TABLE: Authenticated users only
CREATE POLICY "Authenticated users can view orders" ON public.orders
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create orders" ON public.orders
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update orders" ON public.orders
FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Admins can delete orders" ON public.orders
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- PICKUP_DROPS TABLE: Authenticated users only
CREATE POLICY "Authenticated users can view pickup_drops" ON public.pickup_drops
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create pickup_drops" ON public.pickup_drops
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update pickup_drops" ON public.pickup_drops
FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Admins can delete pickup_drops" ON public.pickup_drops
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ORDER_FILES TABLE: Authenticated users only
CREATE POLICY "Authenticated users can view order_files" ON public.order_files
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create order_files" ON public.order_files
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update order_files" ON public.order_files
FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Admins can delete order_files" ON public.order_files
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- TRUCKS TABLE: Manager/Admin roles only
CREATE POLICY "Managers and admins can view trucks" ON public.trucks
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers and admins can create trucks" ON public.trucks
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers and admins can update trucks" ON public.trucks
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admins can delete trucks" ON public.trucks
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- TRAILERS TABLE: Manager/Admin roles only
CREATE POLICY "Managers and admins can view trailers" ON public.trailers
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers and admins can create trailers" ON public.trailers
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers and admins can update trailers" ON public.trailers
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admins can delete trailers" ON public.trailers
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
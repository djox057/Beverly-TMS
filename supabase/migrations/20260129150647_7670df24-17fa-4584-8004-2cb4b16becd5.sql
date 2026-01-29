-- Drop all public read access policies that bypass authentication

DROP POLICY IF EXISTS "Public read access for orders" ON public.orders;
DROP POLICY IF EXISTS "Public read access for pickup_drops" ON public.pickup_drops;
DROP POLICY IF EXISTS "Public read access for order_transfers" ON public.order_transfers;
DROP POLICY IF EXISTS "Public read access for order_files" ON public.order_files;
DROP POLICY IF EXISTS "Public read access for drivers" ON public.drivers;
DROP POLICY IF EXISTS "Public read access for trucks" ON public.trucks;
DROP POLICY IF EXISTS "Public read access for trailers" ON public.trailers;
DROP POLICY IF EXISTS "Public read access for brokers" ON public.brokers;
DROP POLICY IF EXISTS "Public read access for companies" ON public.companies;
DROP POLICY IF EXISTS "Public read access for profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public read access for driver_problems" ON public.driver_problems;
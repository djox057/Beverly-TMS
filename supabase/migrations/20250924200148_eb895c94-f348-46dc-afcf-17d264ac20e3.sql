-- Add TONU field and split mileage into loaded_miles and dh_miles
ALTER TABLE public.orders 
ADD COLUMN tonu numeric DEFAULT 0,
ADD COLUMN loaded_miles integer DEFAULT 0,
ADD COLUMN dh_miles integer DEFAULT 0;
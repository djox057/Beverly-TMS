-- Add escort fee columns to orders table
ALTER TABLE public.orders 
ADD COLUMN escort_fee numeric,
ADD COLUMN escort_fee_broker_paid boolean DEFAULT false;
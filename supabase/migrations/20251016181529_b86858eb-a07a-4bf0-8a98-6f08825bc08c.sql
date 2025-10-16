-- Add no tracking fee and wrong address fee columns to orders table
ALTER TABLE public.orders
ADD COLUMN no_tracking_fee numeric DEFAULT 0,
ADD COLUMN no_tracking_fee_driver numeric DEFAULT 0,
ADD COLUMN wrong_address_fee numeric DEFAULT 0,
ADD COLUMN wrong_address_fee_driver numeric DEFAULT 0;
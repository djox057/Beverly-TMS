-- Add additional fee fields to orders table
ALTER TABLE public.orders 
ADD COLUMN detention DECIMAL(10,2),
ADD COLUMN layover DECIMAL(10,2), 
ADD COLUMN extra_stop DECIMAL(10,2),
ADD COLUMN lumper DECIMAL(10,2),
ADD COLUMN late_fee DECIMAL(10,2);
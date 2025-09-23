-- Add date range support for pickup and delivery
ALTER TABLE public.orders 
ADD COLUMN pickup_end_datetime TIMESTAMP WITH TIME ZONE,
ADD COLUMN delivery_end_datetime TIMESTAMP WITH TIME ZONE;

-- Update existing orders to have end dates same as start dates for backwards compatibility
UPDATE public.orders 
SET pickup_end_datetime = pickup_datetime,
    delivery_end_datetime = delivery_datetime
WHERE pickup_end_datetime IS NULL OR delivery_end_datetime IS NULL;
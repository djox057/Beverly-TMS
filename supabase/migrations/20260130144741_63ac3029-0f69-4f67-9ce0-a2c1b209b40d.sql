-- Add original_delivery_datetime column to orders table
-- This stores the FIRST delivery datetime before any reschedule
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS original_delivery_datetime TIMESTAMP WITH TIME ZONE;

-- Create trigger function to capture original delivery date on FIRST change
CREATE OR REPLACE FUNCTION public.capture_original_delivery_datetime()
RETURNS TRIGGER AS $$
BEGIN
  -- Only capture if:
  -- 1. delivery_datetime is actually changing
  -- 2. original_delivery_datetime is NOT already set (preserve first value)
  -- 3. OLD.delivery_datetime was not null (we have something to preserve)
  IF OLD.delivery_datetime IS DISTINCT FROM NEW.delivery_datetime 
     AND NEW.original_delivery_datetime IS NULL 
     AND OLD.delivery_datetime IS NOT NULL THEN
    NEW.original_delivery_datetime := OLD.delivery_datetime;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger on orders table
DROP TRIGGER IF EXISTS capture_original_delivery_datetime_trigger ON public.orders;
CREATE TRIGGER capture_original_delivery_datetime_trigger
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.capture_original_delivery_datetime();

-- Add index for efficient reschedule queries
CREATE INDEX IF NOT EXISTS idx_orders_original_delivery_datetime 
ON public.orders (original_delivery_datetime) 
WHERE original_delivery_datetime IS NOT NULL;

-- Step 1: Convert column from integer to text
ALTER TABLE orders ALTER COLUMN internal_load_number TYPE text USING internal_load_number::text;

-- Step 2: Backfill existing rows with company suffix
UPDATE orders o
SET internal_load_number = o.internal_load_number || '-' || (
  CASE
    WHEN c.name ILIKE '%bf prime united%' THEN 'BFU'
    WHEN c.name ILIKE '%bf prime%' THEN 'BFP'
    WHEN c.name ILIKE '%beverly freight%' THEN 'BF'
    WHEN c.name ILIKE '%united enterprise%' THEN 'UE'
    WHEN c.name ILIKE '%bg prime%' THEN 'BG'
    WHEN c.name ILIKE '%ap silver%' THEN 'AP'
    ELSE ''
  END
)
FROM companies c
WHERE o.company_id = c.id
  AND o.internal_load_number IS NOT NULL
  AND o.internal_load_number !~ '-';

-- Clean up any trailing dash for companies with no suffix
UPDATE orders
SET internal_load_number = rtrim(internal_load_number, '-')
WHERE internal_load_number LIKE '%-'
  AND internal_load_number IS NOT NULL;

-- Step 3: Drop the reassign RPC
DROP FUNCTION IF EXISTS public.reassign_internal_load_number(uuid, uuid);

-- Step 4: Replace create_order_with_unique_load_number to store suffixed text
CREATE OR REPLACE FUNCTION public.create_order_with_unique_load_number(order_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_load_number integer;
  new_order_id uuid;
  result jsonb;
  company_uuid uuid;
  company_name_val text;
  suffix text;
  full_load_number text;
BEGIN
  company_uuid := (order_data->>'company_id')::uuid;
  
  PERFORM pg_advisory_xact_lock(hashtext(company_uuid::text));
  
  -- Get company name for suffix
  SELECT name INTO company_name_val FROM companies WHERE id = company_uuid;
  
  -- Determine suffix
  suffix := CASE
    WHEN company_name_val ILIKE '%bf prime united%' THEN 'BFU'
    WHEN company_name_val ILIKE '%bf prime%' THEN 'BFP'
    WHEN company_name_val ILIKE '%beverly freight%' THEN 'BF'
    WHEN company_name_val ILIKE '%united enterprise%' THEN 'UE'
    WHEN company_name_val ILIKE '%bg prime%' THEN 'BG'
    WHEN company_name_val ILIKE '%ap silver%' THEN 'AP'
    ELSE ''
  END;
  
  -- Get next sequential number for this company
  -- Extract numeric part from existing text values
  SELECT COALESCE(MAX(
    CASE 
      WHEN internal_load_number ~ '^\d+' 
      THEN (regexp_replace(internal_load_number, '-.*$', ''))::integer 
      ELSE 0 
    END
  ), 0) + 1
  INTO next_load_number
  FROM orders
  WHERE company_id = company_uuid
    AND internal_load_number IS NOT NULL;
  
  -- Build full load number with suffix
  IF suffix != '' THEN
    full_load_number := next_load_number::text || '-' || suffix;
  ELSE
    full_load_number := next_load_number::text;
  END IF;
  
  INSERT INTO orders (
    load_number,
    internal_load_number,
    company_id,
    booked_by_company_id,
    broker_id,
    truck_id,
    trailer_id,
    driver1_id,
    driver2_id,
    broker_load_number,
    pickup_datetime,
    pickup_end_datetime,
    delivery_datetime,
    delivery_end_datetime,
    freight_amount,
    driver_price,
    tonu,
    loaded_miles,
    dh_miles,
    mileage,
    booked_by
  ) VALUES (
    (order_data->>'load_number')::text,
    full_load_number,
    company_uuid,
    NULLIF(order_data->>'booked_by_company_id', '')::uuid,
    NULLIF(order_data->>'broker_id', '')::uuid,
    NULLIF(order_data->>'truck_id', '')::uuid,
    NULLIF(order_data->>'trailer_id', '')::uuid,
    NULLIF(order_data->>'driver1_id', '')::uuid,
    NULLIF(order_data->>'driver2_id', '')::uuid,
    NULLIF(order_data->>'broker_load_number', '')::text,
    NULLIF(order_data->>'pickup_datetime', '')::timestamptz,
    NULLIF(order_data->>'pickup_end_datetime', '')::timestamptz,
    NULLIF(order_data->>'delivery_datetime', '')::timestamptz,
    NULLIF(order_data->>'delivery_end_datetime', '')::timestamptz,
    NULLIF(order_data->>'freight_amount', '')::numeric,
    NULLIF(order_data->>'driver_price', '')::numeric,
    NULLIF(order_data->>'tonu', '')::numeric,
    CASE WHEN NULLIF(order_data->>'loaded_miles', '') ~ '^[0-9]+(\.[0-9]+)?$'
         THEN (order_data->>'loaded_miles')::numeric ELSE NULL END,
    CASE WHEN NULLIF(order_data->>'dh_miles', '') ~ '^[0-9]+(\.[0-9]+)?$'
         THEN (order_data->>'dh_miles')::numeric ELSE NULL END,
    CASE WHEN NULLIF(order_data->>'mileage', '') ~ '^[0-9]+(\.[0-9]+)?$'
         THEN (order_data->>'mileage')::numeric ELSE NULL END,
    NULLIF(order_data->>'booked_by', '')::text
  )
  RETURNING id INTO new_order_id;
  
  SELECT jsonb_build_object(
    'id', new_order_id,
    'internal_load_number', full_load_number
  ) INTO result;
  
  RETURN result;
END;
$function$;

-- Update the create_order_with_unique_load_number function to generate unique internal load numbers per company
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
BEGIN
  -- Extract company_id from order_data
  company_uuid := (order_data->>'company_id')::uuid;
  
  -- Get the next internal load number for this specific company
  SELECT COALESCE(MAX(internal_load_number), 0) + 1 
  INTO next_load_number
  FROM orders 
  WHERE company_id = company_uuid
    AND internal_load_number IS NOT NULL;
  
  -- Insert the new order with the unique internal load number for this company
  INSERT INTO orders (
    load_number,
    internal_load_number,
    company_id,
    broker_id,
    truck_id,
    driver1_id,
    driver2_id,
    broker_load_number,
    pickup_datetime,
    pickup_end_datetime,
    delivery_datetime,
    delivery_end_datetime,
    freight_amount,
    driver_price,
    mileage,
    booked_by
  ) VALUES (
    (order_data->>'load_number')::text,
    next_load_number,
    company_uuid,
    NULLIF(order_data->>'broker_id', '')::uuid,
    NULLIF(order_data->>'truck_id', '')::uuid,
    NULLIF(order_data->>'driver1_id', '')::uuid,
    NULLIF(order_data->>'driver2_id', '')::uuid,
    NULLIF(order_data->>'broker_load_number', '')::text,
    NULLIF(order_data->>'pickup_datetime', '')::timestamptz,
    NULLIF(order_data->>'pickup_end_datetime', '')::timestamptz,
    NULLIF(order_data->>'delivery_datetime', '')::timestamptz,
    NULLIF(order_data->>'delivery_end_datetime', '')::timestamptz,
    NULLIF(order_data->>'freight_amount', '')::numeric,
    NULLIF(order_data->>'driver_price', '')::numeric,
    NULLIF(order_data->>'mileage', '')::integer,
    NULLIF(order_data->>'booked_by', '')::text
  )
  RETURNING id INTO new_order_id;
  
  -- Return the created order data
  SELECT jsonb_build_object(
    'id', new_order_id,
    'internal_load_number', next_load_number
  ) INTO result;
  
  RETURN result;
END;
$function$
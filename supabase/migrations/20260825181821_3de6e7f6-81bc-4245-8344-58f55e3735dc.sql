ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS load_company_code text;

CREATE INDEX IF NOT EXISTS orders_load_company_code_idx ON public.orders (load_company_code) WHERE load_company_code IS NOT NULL;

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
  v_client_request_id uuid;
  existing_id uuid;
  existing_iln text;
  existing_code text;
BEGIN
  company_uuid        := (order_data->>'company_id')::uuid;
  v_client_request_id := NULLIF(order_data->>'client_request_id', '')::uuid;

  IF company_uuid IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('create_order_with_unique_load_number'),
    hashtext(company_uuid::text)
  );

  IF v_client_request_id IS NOT NULL THEN
    SELECT id, internal_load_number, load_company_code
      INTO existing_id, existing_iln, existing_code
    FROM orders
    WHERE company_id = company_uuid
      AND client_request_id = v_client_request_id
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'id', existing_id,
        'internal_load_number', existing_iln,
        'load_company_code', existing_code
      );
    END IF;
  END IF;

  SELECT name INTO company_name_val FROM companies WHERE id = company_uuid;

  suffix := CASE
    WHEN company_name_val ILIKE '%bf prime united%' THEN 'BFU'
    WHEN company_name_val ILIKE '%bf prime%' THEN 'BFP'
    WHEN company_name_val ILIKE '%beverly freight%' THEN 'BF'
    WHEN company_name_val ILIKE '%united enterprise%' THEN 'UE'
    WHEN company_name_val ILIKE '%bg prime%' THEN 'BG'
    WHEN company_name_val ILIKE '%ap silver%' THEN 'AP'
    ELSE ''
  END;

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

  -- Split: internal load number is now plain numeric; company code stored separately
  full_load_number := next_load_number::text;

  BEGIN
    INSERT INTO orders (
      load_number,
      internal_load_number,
      load_company_code,
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
      booked_by,
      client_request_id
    ) VALUES (
      (order_data->>'load_number')::text,
      full_load_number,
      NULLIF(suffix, ''),
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
      NULLIF(order_data->>'booked_by', '')::text,
      v_client_request_id
    )
    RETURNING id INTO new_order_id;

    result := jsonb_build_object(
      'id', new_order_id,
      'internal_load_number', full_load_number,
      'load_company_code', NULLIF(suffix, '')
    );
  EXCEPTION WHEN unique_violation THEN
    IF v_client_request_id IS NOT NULL THEN
      SELECT id, internal_load_number, load_company_code
        INTO existing_id, existing_iln, existing_code
      FROM orders
      WHERE company_id = company_uuid
        AND client_request_id = v_client_request_id
      LIMIT 1;

      IF existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'id', existing_id,
          'internal_load_number', existing_iln,
          'load_company_code', existing_code
        );
      END IF;
    END IF;
    RAISE;
  END;

  RETURN result;
END;
$function$;
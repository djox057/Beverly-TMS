DO $$
DECLARE
  r RECORD;
  next_num integer;
  suffix text;
  new_load_number text;
  correct_company uuid;
BEGIN
  -- Step 1: Fix company_id mismatches based on suffix
  UPDATE orders SET company_id = '52a2fc7b-28d5-4954-9434-725e71d25672'
  WHERE internal_load_number LIKE '%-AP' AND company_id != '52a2fc7b-28d5-4954-9434-725e71d25672';

  UPDATE orders SET company_id = '1c9792dd-59de-4570-8a84-bc8821b49646'
  WHERE internal_load_number LIKE '%-BFU' AND company_id != '1c9792dd-59de-4570-8a84-bc8821b49646';

  UPDATE orders SET company_id = 'f043b212-7f0d-4420-af37-09c79ea68ad4'
  WHERE internal_load_number LIKE '%-BFP' AND company_id != 'f043b212-7f0d-4420-af37-09c79ea68ad4';

  UPDATE orders SET company_id = '554f1b2f-9f95-4eb1-add7-ddd3fe168ea6'
  WHERE internal_load_number LIKE '%-BF' AND company_id != '554f1b2f-9f95-4eb1-add7-ddd3fe168ea6';

  UPDATE orders SET company_id = '0fc3ad2c-eb06-4727-99d4-218aed6d89e7'
  WHERE internal_load_number LIKE '%-UE' AND company_id != '0fc3ad2c-eb06-4727-99d4-218aed6d89e7';

  UPDATE orders SET company_id = '238a7acf-cbb5-4718-be7a-130d8d971a90'
  WHERE internal_load_number LIKE '%-BG' AND company_id != '238a7acf-cbb5-4718-be7a-130d8d971a90';

  -- Step 2: Fix remaining true duplicates by giving newer orders new numbers
  FOR r IN
    SELECT id, company_id, internal_load_number, created_at
    FROM (
      SELECT id, company_id, internal_load_number, created_at,
             ROW_NUMBER() OVER (PARTITION BY internal_load_number ORDER BY created_at ASC) as rn
      FROM orders
      WHERE internal_load_number IS NOT NULL
    ) sub
    WHERE rn > 1
    ORDER BY company_id, created_at
  LOOP
    -- Get suffix from current load number
    IF position('-' in r.internal_load_number) > 0 THEN
      suffix := substring(r.internal_load_number from position('-' in r.internal_load_number) + 1);
    ELSE
      suffix := '';
    END IF;

    -- Get next available number for this company
    SELECT COALESCE(MAX(
      CASE 
        WHEN internal_load_number ~ '^\d+' 
        THEN (regexp_replace(internal_load_number, '-.*$', ''))::integer 
        ELSE 0 
      END
    ), 0) + 1
    INTO next_num
    FROM orders
    WHERE company_id = r.company_id
      AND internal_load_number IS NOT NULL;

    IF suffix != '' THEN
      new_load_number := next_num::text || '-' || suffix;
    ELSE
      new_load_number := next_num::text;
    END IF;

    UPDATE orders SET internal_load_number = new_load_number WHERE id = r.id;
    
    RAISE NOTICE 'Reassigned % from % to %', r.id, r.internal_load_number, new_load_number;
  END LOOP;
END $$;

-- Now add unique index
CREATE UNIQUE INDEX orders_internal_load_number_unique 
ON public.orders (internal_load_number) 
WHERE internal_load_number IS NOT NULL;
-- Renumber United Enterprise Solutions INC orders to start from 1
-- This assigns sequential internal_load_numbers based on created_at

WITH united_company AS (
  SELECT id FROM companies WHERE name = 'United Enterprise Solutions INC'
),
numbered_orders AS (
  SELECT 
    o.id,
    ROW_NUMBER() OVER (ORDER BY o.created_at ASC) as new_number
  FROM orders o
  JOIN united_company c ON o.company_id = c.id
  WHERE o.internal_load_number IS NOT NULL
)
UPDATE orders
SET internal_load_number = numbered_orders.new_number
FROM numbered_orders
WHERE orders.id = numbered_orders.id;
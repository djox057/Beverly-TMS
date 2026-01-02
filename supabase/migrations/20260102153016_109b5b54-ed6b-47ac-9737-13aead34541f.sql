-- Update order 10129013 dates from 2025 to 2026
UPDATE orders
SET pickup_datetime = pickup_datetime + INTERVAL '1 year',
    delivery_datetime = delivery_datetime + INTERVAL '1 year'
WHERE id = '3b0dfa67-f058-405b-b2b5-e13dd8b1cc43';
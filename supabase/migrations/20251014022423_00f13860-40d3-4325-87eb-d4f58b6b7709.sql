-- Populate booked_by_company_id with existing company_id for all orders
-- This ensures existing orders display the correct company in the Company column
UPDATE public.orders
SET booked_by_company_id = company_id
WHERE booked_by_company_id IS NULL;
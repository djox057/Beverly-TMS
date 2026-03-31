ALTER TABLE public.transfer_list ADD COLUMN drug_test_zip text;
ALTER TABLE public.transfer_list ALTER COLUMN coming_to_office TYPE date USING coming_to_office::date;
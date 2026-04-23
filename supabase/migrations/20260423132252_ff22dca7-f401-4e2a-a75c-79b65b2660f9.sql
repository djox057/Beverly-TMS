INSERT INTO public.transfer_list (truck_id, driver_id, going_to_company, transfer_type)
SELECT t.id, t.driver1_id, 'AP Silver Trans LLC', 'ues'
FROM public.trucks t
WHERE t.truck_number IN ('0792','0795','0796','1031','1289','1354','1355','1359','2112','2136','2140','327','4446','4649','4655','4698','5386','5870','6558','7329','7459','7778','8545','9678')
  AND NOT EXISTS (
    SELECT 1 FROM public.transfer_list tl
    WHERE tl.truck_id = t.id AND tl.transfer_type='ues'
  );
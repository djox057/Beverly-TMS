
-- Add new UES transfers for trucks that don't have one yet
INSERT INTO public.transfer_list (truck_id, driver_id, going_to_company, transfer_type)
VALUES
  ('35f45214-91e4-4453-8e2c-6ab000767293', 'c0b2c33f-f3ce-4fbb-8420-4b4fcc1b2dad', 'Beverly Freight Inc', 'ues'),
  ('116ce8da-3a68-4968-98e5-ab7ba2ee246d', 'cd732f71-1b40-4e5e-bb9e-057d27a791fa', 'Beverly Freight Inc', 'ues');

-- Update existing UES transfers to change destination to Beverly Freight Inc
UPDATE public.transfer_list
SET going_to_company = 'Beverly Freight Inc'
WHERE transfer_type = 'ues'
  AND truck_id IN (
    'c68ac337-952f-4417-a141-56756cc06475',
    '124d3039-8211-4886-99e2-8a10edea6888',
    'ca41d800-f68b-4a33-ad63-a51234d5fb6e',
    '21932c2f-a205-4a13-9fe5-a28ca0a81a9d',
    'aa58cecd-4d22-40b9-9018-dd0323e7b909',
    'a741f7b8-2c81-43ad-91fd-d29d7b4ef009',
    'ece0e45f-4bed-45ee-af4f-4d344326eab5',
    '53dd5c27-12fc-4da4-95de-c0d1c8b07842',
    'f005c5d8-c16e-4c9a-9e12-b2821dad5815',
    '3ea62de2-3412-4c6f-a93f-3bf719c7011f',
    'ea0e6916-a65b-4df6-992d-46004ea1ad5c'
  );

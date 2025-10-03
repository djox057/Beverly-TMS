-- Change clearing_house to date type
ALTER TABLE public.drivers
  ALTER COLUMN clearing_house TYPE date USING clearing_house::date;
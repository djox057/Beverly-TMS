INSERT INTO public.dispatcher_off_duty_days (dispatcher_id, off_duty_date)
VALUES 
  ('05d173c6-bba9-4bf5-a95c-3b7dac4e6c6f', '2026-01-06'),
  ('05d173c6-bba9-4bf5-a95c-3b7dac4e6c6f', '2026-01-07'),
  ('05d173c6-bba9-4bf5-a95c-3b7dac4e6c6f', '2026-01-08'),
  ('05d173c6-bba9-4bf5-a95c-3b7dac4e6c6f', '2026-01-09')
ON CONFLICT (dispatcher_id, off_duty_date) DO NOTHING;
-- Update driver foreign keys to automatically null/delete references on driver deletion

-- truck notes: non-nullable -> delete
ALTER TABLE public.truck_notes
  DROP CONSTRAINT IF EXISTS truck_notes_driver_id_fkey;
ALTER TABLE public.truck_notes
  ADD CONSTRAINT truck_notes_driver_id_fkey
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id)
  ON DELETE CASCADE;

-- truck note history: non-nullable -> delete
ALTER TABLE public.truck_note_history
  DROP CONSTRAINT IF EXISTS truck_note_history_driver_id_fkey;
ALTER TABLE public.truck_note_history
  ADD CONSTRAINT truck_note_history_driver_id_fkey
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id)
  ON DELETE CASCADE;

-- lost day notes: non-nullable -> delete
ALTER TABLE public.lost_day_notes
  DROP CONSTRAINT IF EXISTS lost_day_notes_driver_id_fkey;
ALTER TABLE public.lost_day_notes
  ADD CONSTRAINT lost_day_notes_driver_id_fkey
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id)
  ON DELETE CASCADE;

-- trucks: nullable -> null out
ALTER TABLE public.trucks
  DROP CONSTRAINT IF EXISTS trucks_driver1_id_fkey;
ALTER TABLE public.trucks
  ADD CONSTRAINT trucks_driver1_id_fkey
  FOREIGN KEY (driver1_id) REFERENCES public.drivers(id)
  ON DELETE SET NULL;

ALTER TABLE public.trucks
  DROP CONSTRAINT IF EXISTS trucks_driver2_id_fkey;
ALTER TABLE public.trucks
  ADD CONSTRAINT trucks_driver2_id_fkey
  FOREIGN KEY (driver2_id) REFERENCES public.drivers(id)
  ON DELETE SET NULL;

-- orders: nullable -> null out
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_driver1_id_fkey;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_driver1_id_fkey
  FOREIGN KEY (driver1_id) REFERENCES public.drivers(id)
  ON DELETE SET NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_driver2_id_fkey;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_driver2_id_fkey
  FOREIGN KEY (driver2_id) REFERENCES public.drivers(id)
  ON DELETE SET NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_original_driver1_id_fkey;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_original_driver1_id_fkey
  FOREIGN KEY (original_driver1_id) REFERENCES public.drivers(id)
  ON DELETE SET NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_original_driver2_id_fkey;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_original_driver2_id_fkey
  FOREIGN KEY (original_driver2_id) REFERENCES public.drivers(id)
  ON DELETE SET NULL;

-- recovery history: nullable -> null out
ALTER TABLE public.recovery_history
  DROP CONSTRAINT IF EXISTS recovery_history_original_driver1_id_fkey;
ALTER TABLE public.recovery_history
  ADD CONSTRAINT recovery_history_original_driver1_id_fkey
  FOREIGN KEY (original_driver1_id) REFERENCES public.drivers(id)
  ON DELETE SET NULL;

ALTER TABLE public.recovery_history
  DROP CONSTRAINT IF EXISTS recovery_history_original_driver2_id_fkey;
ALTER TABLE public.recovery_history
  ADD CONSTRAINT recovery_history_original_driver2_id_fkey
  FOREIGN KEY (original_driver2_id) REFERENCES public.drivers(id)
  ON DELETE SET NULL;

ALTER TABLE public.recovery_history
  DROP CONSTRAINT IF EXISTS recovery_history_recovery_driver1_id_fkey;
ALTER TABLE public.recovery_history
  ADD CONSTRAINT recovery_history_recovery_driver1_id_fkey
  FOREIGN KEY (recovery_driver1_id) REFERENCES public.drivers(id)
  ON DELETE SET NULL;

ALTER TABLE public.recovery_history
  DROP CONSTRAINT IF EXISTS recovery_history_recovery_driver2_id_fkey;
ALTER TABLE public.recovery_history
  ADD CONSTRAINT recovery_history_recovery_driver2_id_fkey
  FOREIGN KEY (recovery_driver2_id) REFERENCES public.drivers(id)
  ON DELETE SET NULL;

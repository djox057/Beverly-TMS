CREATE INDEX IF NOT EXISTS orders_locked_true_created_at_idx
  ON public.orders (created_at DESC)
  WHERE locked = true;

CREATE INDEX IF NOT EXISTS orders_locked_false_created_at_idx
  ON public.orders (created_at DESC)
  WHERE locked = false;
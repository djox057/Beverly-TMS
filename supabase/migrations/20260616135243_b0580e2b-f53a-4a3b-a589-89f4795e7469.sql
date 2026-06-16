ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gross_percent numeric,
  ADD COLUMN IF NOT EXISTS cut_percent numeric;

UPDATE public.profiles p
SET gross_percent = COALESCE(p.gross_percent, 1),
    cut_percent = COALESCE(p.cut_percent, 5)
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.user_id AND ur.role = 'dispatch'::app_role
);
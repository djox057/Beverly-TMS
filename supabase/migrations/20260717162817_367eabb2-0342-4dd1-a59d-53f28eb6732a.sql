ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suggestions_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suggestions_mode boolean NOT NULL DEFAULT false;
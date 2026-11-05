-- Keep is_active=false for both inactive states so existing availability checks
-- continue to exclude temporarily inactive equipment.
ALTER TABLE public.trucks
  ADD COLUMN is_temporary_inactive boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT trucks_temporary_inactive_requires_inactive
    CHECK (NOT is_temporary_inactive OR is_active IS FALSE);

ALTER TABLE public.trailers
  ADD COLUMN is_temporary_inactive boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT trailers_temporary_inactive_requires_inactive
    CHECK (NOT is_temporary_inactive OR is_active IS FALSE);

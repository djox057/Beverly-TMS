ALTER TABLE public.upcoming_drivers ADD COLUMN IF NOT EXISTS row_color text;
ALTER TABLE public.upcoming_drivers ADD CONSTRAINT upcoming_drivers_row_color_check CHECK (row_color IS NULL OR row_color IN ('blue','yellow','green'));

DROP POLICY IF EXISTS upcoming_drivers_read ON public.upcoming_drivers;
CREATE POLICY upcoming_drivers_read ON public.upcoming_drivers FOR SELECT
USING (
  ((SELECT upcoming_drivers_private.primary_role()) = ANY (ARRAY['admin','manager','supervisor','safety','recruiting','chicago_management']))
  OR ((SELECT upcoming_drivers_private.primary_role()) = 'dispatch' AND dispatcher_id = auth.uid())
);

DROP POLICY IF EXISTS upcoming_drivers_update ON public.upcoming_drivers;
CREATE POLICY upcoming_drivers_update ON public.upcoming_drivers FOR UPDATE
USING (
  ((SELECT upcoming_drivers_private.primary_role()) = ANY (ARRAY['admin','manager','supervisor','safety','recruiting']))
  OR ((SELECT upcoming_drivers_private.primary_role()) = 'dispatch' AND dispatcher_id = auth.uid())
)
WITH CHECK (
  ((SELECT upcoming_drivers_private.primary_role()) = ANY (ARRAY['admin','manager','supervisor','safety','recruiting']))
  OR ((SELECT upcoming_drivers_private.primary_role()) = 'dispatch' AND dispatcher_id = auth.uid())
);
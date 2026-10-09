-- Add a truck-level insurance status that can be maintained directly in the TMS.
ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS is_insured boolean NOT NULL DEFAULT false;

-- Preserve the current Samsara status as the starting value. Unknown statuses
-- are conservatively initialized as not insured.
UPDATE public.trucks
SET is_insured = COALESCE(samsara_insured, false);

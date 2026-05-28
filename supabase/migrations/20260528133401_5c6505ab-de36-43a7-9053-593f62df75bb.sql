ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS miles_away_updated_at timestamptz;

-- Backfill so the next stale-GPS run doesn't immediately wipe existing values
UPDATE public.trucks SET miles_away_updated_at = now() WHERE miles_away IS NOT NULL AND miles_away_updated_at IS NULL;

-- Extend bulk update RPC to also set the timestamp when miles_away is provided
CREATE OR REPLACE FUNCTION public.bulk_update_truck_distances(updates jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE trucks t
  SET miles_away = u.miles_away,
      eta_minutes = u.eta_minutes,
      miles_away_updated_at = CASE WHEN u.miles_away IS NOT NULL THEN now() ELSE t.miles_away_updated_at END
  FROM (
    SELECT id, miles_away, eta_minutes
    FROM jsonb_to_recordset(updates) AS x(id uuid, miles_away integer, eta_minutes integer)
  ) u
  WHERE t.id = u.id;
$function$;
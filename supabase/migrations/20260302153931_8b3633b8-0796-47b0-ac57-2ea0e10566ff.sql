CREATE OR REPLACE FUNCTION public.bulk_update_truck_distances(updates jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = 'public' AS $$
  UPDATE trucks t
  SET miles_away = u.miles_away,
      eta_minutes = u.eta_minutes
  FROM (
    SELECT id, miles_away, eta_minutes
    FROM jsonb_to_recordset(updates) AS x(id uuid, miles_away integer, eta_minutes integer)
  ) u
  WHERE t.id = u.id;
$$;
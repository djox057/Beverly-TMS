CREATE OR REPLACE FUNCTION public.get_latest_odometer_files()
RETURNS TABLE(truck_id uuid, file_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT DISTINCT ON (split_part(o.name, '/', 1))
    split_part(o.name, '/', 1)::uuid AS truck_id,
    split_part(o.name, '/', 2) AS file_name
  FROM storage.objects o
  WHERE o.bucket_id = 'truck-odometer-files'
    AND o.name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+$'
  ORDER BY split_part(o.name, '/', 1), o.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_latest_odometer_files() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_latest_odometer_files() TO authenticated;
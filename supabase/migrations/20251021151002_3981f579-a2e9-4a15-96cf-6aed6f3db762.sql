-- Update the function to properly delete all sessions
CREATE OR REPLACE FUNCTION public.sign_out_all_users()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, pg_temp
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete all sessions from auth.sessions table (with proper WHERE clause)
  DELETE FROM auth.sessions WHERE id IS NOT NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'sessions_deleted', deleted_count
  );
END;
$$;
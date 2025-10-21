-- Create a function to sign out all users by clearing their sessions
CREATE OR REPLACE FUNCTION public.sign_out_all_users()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, pg_temp
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete all sessions from auth.sessions table
  DELETE FROM auth.sessions;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'sessions_deleted', deleted_count
  );
END;
$$;
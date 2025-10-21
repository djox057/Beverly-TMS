-- Update the function to delete both sessions and refresh tokens
CREATE OR REPLACE FUNCTION public.sign_out_all_users()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, pg_temp
AS $$
DECLARE
  sessions_deleted integer;
  tokens_deleted integer;
BEGIN
  -- Delete all sessions from auth.sessions table
  DELETE FROM auth.sessions WHERE id IS NOT NULL;
  GET DIAGNOSTICS sessions_deleted = ROW_COUNT;
  
  -- Delete all refresh tokens from auth.refresh_tokens table
  DELETE FROM auth.refresh_tokens WHERE id IS NOT NULL;
  GET DIAGNOSTICS tokens_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'sessions_deleted', sessions_deleted,
    'tokens_deleted', tokens_deleted
  );
END;
$$;
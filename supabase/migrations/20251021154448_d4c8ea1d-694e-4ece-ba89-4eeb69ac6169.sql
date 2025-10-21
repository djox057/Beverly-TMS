-- Fix the function to include WHERE clauses for DELETE statements
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
  -- Delete all refresh tokens first (they have foreign key to sessions)
  DELETE FROM auth.refresh_tokens WHERE token IS NOT NULL;
  GET DIAGNOSTICS tokens_deleted = ROW_COUNT;
  
  -- Then delete all sessions
  DELETE FROM auth.sessions WHERE id IS NOT NULL;
  GET DIAGNOSTICS sessions_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'sessions_deleted', sessions_deleted,
    'tokens_deleted', tokens_deleted
  );
END;
$$;
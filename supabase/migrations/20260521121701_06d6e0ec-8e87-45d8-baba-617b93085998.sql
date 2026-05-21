DO $$
DECLARE
  v_user_id uuid := 'cbe38d3f-6323-400e-b5c6-d8327f4110a5';
  v_full_name text;
BEGIN
  SELECT full_name INTO v_full_name FROM public.profiles WHERE user_id = v_user_id;

  -- Snapshot names in assignment_history before deleting profile
  IF v_full_name IS NOT NULL THEN
    UPDATE public.assignment_history SET dispatcher_name_snapshot = v_full_name WHERE dispatcher_id = v_user_id;
    UPDATE public.assignment_history SET old_dispatcher_name_snapshot = v_full_name WHERE old_dispatcher_id = v_user_id;
    UPDATE public.assignment_history SET changed_by_name_snapshot = v_full_name WHERE changed_by = v_user_id;
  END IF;

  -- Nullify FK references that can block deletion
  UPDATE public.recovery_history SET original_dispatcher_id = NULL WHERE original_dispatcher_id = v_user_id;
  UPDATE public.recovery_history SET reverted_by = NULL WHERE reverted_by = v_user_id;
  BEGIN
    UPDATE public.recovery_history SET new_dispatcher_id = NULL WHERE new_dispatcher_id = v_user_id;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  UPDATE public.truck_note_history SET edited_by = NULL WHERE edited_by = v_user_id;
  UPDATE public.trucks SET dispatcher_id = NULL WHERE dispatcher_id = v_user_id;
  BEGIN
    UPDATE public.hos_requests SET requester_user_id = NULL WHERE requester_user_id = v_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;
  BEGIN
    UPDATE public.trailer_termination_notes SET created_by = NULL WHERE created_by = v_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;
  BEGIN
    UPDATE public.truck_termination_notes SET created_by = NULL WHERE created_by = v_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- Remove app-side records
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  DELETE FROM public.profiles WHERE user_id = v_user_id;

  -- Finally delete auth user (cascades remaining auth-side rows)
  DELETE FROM auth.users WHERE id = v_user_id;
END $$;
-- Add revised_rc_path column to efs_other_requests for lumper revised rate confirmations
ALTER TABLE public.efs_other_requests 
ADD COLUMN revised_rc_path TEXT NULL;

-- Add comment to describe the column
COMMENT ON COLUMN public.efs_other_requests.revised_rc_path IS 'Path to the revised rate confirmation file uploaded for lumper requests';
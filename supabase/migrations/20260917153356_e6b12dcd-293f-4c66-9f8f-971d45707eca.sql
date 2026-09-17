REVOKE ALL ON FUNCTION public.archive_completed_hr_reports() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_completed_hr_reports() TO postgres, service_role;
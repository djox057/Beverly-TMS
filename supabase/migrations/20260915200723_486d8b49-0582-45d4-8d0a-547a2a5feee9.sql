ALTER TABLE public.recruiting_driver_expenses ADD COLUMN IF NOT EXISTS recruiter_id uuid;

CREATE INDEX IF NOT EXISTS recruiting_driver_expenses_recruiter_id_idx ON public.recruiting_driver_expenses (recruiter_id);

WITH fixed AS (
  SELECT e.id,
         lower(trim(CASE lower(trim(e.recruiter))
           WHEN 'klye' THEN 'kyle'
           WHEN 'aslhey' THEN 'ashley'
           WHEN 'miey' THEN 'miley'
           WHEN 'alysaa' THEN 'alyssa'
           WHEN 'rebbeca' THEN 'rebecca'
           WHEN 'micheala' THEN 'michaela'
           ELSE lower(trim(e.recruiter))
         END)) AS nick
  FROM public.recruiting_driver_expenses e
  WHERE e.recruiter IS NOT NULL AND btrim(e.recruiter) <> ''
), staff AS (
  SELECT p.user_id,
         lower(trim(regexp_replace(p.full_name, '^.*[- ]', ''))) AS nick
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.user_id
  WHERE r.role = 'recruiting'
)
UPDATE public.recruiting_driver_expenses e
SET recruiter_id = s.user_id
FROM fixed f
JOIN staff s ON s.nick = f.nick
WHERE e.id = f.id AND e.recruiter_id IS NULL;
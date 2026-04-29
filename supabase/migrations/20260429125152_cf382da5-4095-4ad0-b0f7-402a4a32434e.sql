CREATE OR REPLACE FUNCTION public.get_dispatcher_salary_penalties(
  _user_id uuid,
  _month text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(adjustment)
      FROM public.dispatcher_salary_payments dsp
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(dsp.additionals, '[]'::jsonb)) AS adjustment
      WHERE dsp.user_id = _user_id
        AND dsp.month = _month
        AND adjustment->>'type' = 'penalty'
    ),
    '[]'::jsonb
  )
  WHERE auth.uid() = _user_id
    AND public.has_role(auth.uid(), 'dispatch'::public.app_role);
$$;

REVOKE ALL ON FUNCTION public.get_dispatcher_salary_penalties(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dispatcher_salary_penalties(uuid, text) TO authenticated;
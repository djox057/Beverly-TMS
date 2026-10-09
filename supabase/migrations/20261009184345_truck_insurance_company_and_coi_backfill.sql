ALTER TABLE public.trucks ADD COLUMN insurance_company_id uuid REFERENCES public.companies(id);
WITH matched AS (
 SELECT DISTINCT ON (t.id) t.id, c.id AS company_id
 FROM public.trucks t
 JOIN public.company_coi_vins v ON upper(regexp_replace(t.vin, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(v.vin, '[^A-Za-z0-9]', '', 'g'))
 JOIN public.companies c ON lower(trim(c.name)) = lower(trim(v.company_name))
 WHERE nullif(regexp_replace(t.vin, '[^A-Za-z0-9]', '', 'g'),'') IS NOT NULL
 ORDER BY t.id, (c.id = t.company_id) DESC NULLS LAST, v.created_at DESC, v.id DESC
)
UPDATE public.trucks t SET is_insured = (m.company_id IS NOT NULL), insurance_company_id = m.company_id
FROM (SELECT t2.id, matched.company_id FROM public.trucks t2 LEFT JOIN matched ON matched.id = t2.id) m
WHERE t.id = m.id;
ALTER TABLE public.trucks ADD CONSTRAINT trucks_insurance_company_required CHECK (is_insured = (insurance_company_id IS NOT NULL));
COMMENT ON COLUMN public.trucks.insurance_company_id IS 'Company providing truck insurance; required when is_insured is true.';

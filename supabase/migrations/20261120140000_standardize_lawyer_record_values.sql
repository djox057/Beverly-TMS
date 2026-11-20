-- Match Lawyers dropdown values while preserving untouched keys and unanswered cells.
with normalized as (
  select id,
    case lower(btrim(fields->>'company'))
      when 'ap silver' then 'AP Silver Trans LLC'
      when 'ap silver trans' then 'AP Silver Trans LLC'
      when 'ap silver trans llc' then 'AP Silver Trans LLC'
      when 'beverly freight' then 'Beverly Freight Inc'
      when 'beverly freght' then 'Beverly Freight Inc'
      when 'bf prime' then 'BF Prime LLC'
      when 'bf prime llc' then 'BF Prime LLC'
      when 'bf prime united' then 'BF Prime United LLC'
      when 'enterprise' then 'United Enterprise Solutions INC'
      when 'enterprise solution' then 'United Enterprise Solutions INC'
      when 'united enterprise' then 'United Enterprise Solutions INC'
      when 'united enterprise solutions' then 'United Enterprise Solutions INC'
      when 'united enterpise solutions inc' then 'United Enterprise Solutions INC'
    end as company,
    case lower(btrim(fields->>'oos'))
      when 'yes' then 'Yes'
      when 'no' then 'No'
      when 'not sure' then 'Not sure'
    end as oos
  from public.roadside_records
  where sheet = 'Lawyers'
)
update public.roadside_records as record
set fields = record.fields || jsonb_strip_nulls(jsonb_build_object('company', normalized.company, 'oos', normalized.oos))
from normalized
where record.id = normalized.id
  and (
    (normalized.company is not null and record.fields->>'company' is distinct from normalized.company)
    or (normalized.oos is not null and record.fields->>'oos' is distinct from normalized.oos)
  );

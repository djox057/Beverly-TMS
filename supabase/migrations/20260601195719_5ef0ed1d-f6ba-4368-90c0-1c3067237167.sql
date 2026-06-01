WITH data(variants, make, model, tr, yr, mi, eng, apu, inv, frg, price, weeks) AS (VALUES
(ARRAY['265']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 119000::int, 'DD15', false, true, true, 800.0::numeric, 156::int),
(ARRAY['3071']::text[], 'PETERBILT', '579', 'Automatic', 2026::int, 0::int, 'CUMMINS', true, true, true, 900.0::numeric, 208::int),
(ARRAY['3073']::text[], 'PETERBILT', '579', 'Automatic', 2026::int, 0::int, 'CUMMINS', true, true, true, 900.0::numeric, 208::int),
(ARRAY['4229']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'DD15', true, true, true, 900.0::numeric, 208::int),
(ARRAY['4255']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'DD15', true, true, true, 900.0::numeric, 208::int),
(ARRAY['07331','7331','O7331']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 122000::int, 'DD15', true, false, false, 850.0::numeric, 182::int),
(ARRAY['7780']::text[], 'KENWORTH', 'T680', 'Automatic', 2027::int, 0::int, 'CUMMINS', false, true, true, 900.0::numeric, 208::int),
(ARRAY['9877']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 32000::int, 'DD15', true, true, true, 900.0::numeric, 191::int)
)
, matched AS (
  SELECT DISTINCT ON (t.id) t.id AS truck_id, t.driver1_id, d.make, d.model, d.tr, d.yr, d.mi, d.eng, d.apu, d.inv, d.frg, d.price, d.weeks
  FROM trucks t JOIN data d ON t.truck_number = ANY(d.variants)
)
, upd_trucks AS (
  UPDATE trucks t SET
    make = COALESCE(m.make, t.make), model = COALESCE(m.model, t.model),
    transmission = COALESCE(m.tr, t.transmission), year = COALESCE(m.yr, t.year),
    miles = COALESCE(m.mi, t.miles), engine = COALESCE(m.eng, t.engine),
    has_apu_webasto = COALESCE(m.apu, t.has_apu_webasto),
    has_inverter = COALESCE(m.inv, t.has_inverter),
    has_fridge = COALESCE(m.frg, t.has_fridge)
  FROM matched m WHERE t.id = m.truck_id RETURNING t.id
)
UPDATE drivers dr SET
  weekly_payment = COALESCE(m.price, dr.weekly_payment),
  weeks_count = COALESCE(m.weeks, dr.weeks_count)
FROM matched m
WHERE dr.id = m.driver1_id AND (m.price IS NOT NULL OR m.weeks IS NOT NULL);
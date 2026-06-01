WITH data(variants, make, model, tr, yr, mi, eng, apu, inv, frg, price, weeks) AS (VALUES
(ARRAY['04660','4660','O4660']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'DD15', true, true, true, NULL::numeric, NULL::int),
(ARRAY['4272']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'CUMMINS', true, true, true, NULL::numeric, NULL::int),
(ARRAY['4265']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'CUMMINS', true, true, true, NULL::numeric, NULL::int),
(ARRAY['4278']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'CUMMINS', true, true, true, NULL::numeric, NULL::int),
(ARRAY['8667']::text[], 'PETERBILT', '579', 'Automatic', 2024::int, 190000::int, 'CUMMINS', false, true, true, NULL::numeric, NULL::int),
(ARRAY['385']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 46000::int, 'DD15', false, true, true, 900.0::numeric, 191::int),
(ARRAY['0460','460','O460']::text[], 'VOLVO', 'VNL 660', 'Automatic', 2026::int, 103000::int, 'VOLVO D13', false, true, true, 900.0::numeric, 182::int),
(ARRAY['00134','0134','O0134']::text[], 'PETERBILT', '567', 'Automatic', 2023::int, 410000::int, 'PACCAR', false, true, true, 600.0::numeric, 130::int),
(ARRAY['00364','0364','O0364']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 142000::int, 'DD15', true, false, false, 800.0::numeric, 182::int),
(ARRAY['0657','657','O657']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 90000::int, 'DD15', true, true, true, 900.0::numeric, 182::int),
(ARRAY['02452','2452','O2452']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 22000::int, 'DD15', false, true, true, 900.0::numeric, 191::int),
(ARRAY['01031','1031','O1031']::text[], 'PETERBILT', '579', 'Automatic', 2024::int, 392000::int, 'PACCAR', false, true, true, 600.0::numeric, 130::int),
(ARRAY['01289','1289','O1289']::text[], 'KENWORTH', 'T680', 'Automatic', 2024::int, 326000::int, 'PACCAR', false, true, true, 600.0::numeric, 130::int),
(ARRAY['01354','1354','O1354']::text[], 'KENWORTH', 'T680', 'Automatic', 2024::int, 360000::int, 'PACCAR', false, true, true, 600.0::numeric, 130::int),
(ARRAY['2365']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 60000::int, 'DD15', false, true, true, 900.0::numeric, 182::int),
(ARRAY['2893']::text[], 'VOLVO M&K', 'VNL 760', 'Automatic', 2026::int, 0::int, 'VOLVO', true, true, true, 900.0::numeric, 208::int),
(ARRAY['2894']::text[], 'VOLVO M&K', 'VNL 760', 'Automatic', 2026::int, 0::int, 'VOLVO', true, true, true, 900.0::numeric, 208::int),
(ARRAY['2897']::text[], 'VOLVO M&K', 'VNL 760', 'Automatic', 2026::int, 0::int, 'VOLVO', true, true, true, 900.0::numeric, 208::int),
(ARRAY['02932','2932','O2932']::text[], 'PETERBILT', '579', 'Automatic', 2026::int, 43192::int, 'CUMMINS', true, true, true, 900.0::numeric, 191::int),
(ARRAY['3126']::text[], 'PETERBILT', '579', 'Automatic', 2026::int, 0::int, 'CUMMINS', true, true, true, 900.0::numeric, 208::int),
(ARRAY['3128']::text[], 'PETERBILT', '579', 'Automatic', 2026::int, 0::int, 'CUMMINS', true, true, true, 900.0::numeric, 208::int),
(ARRAY['3135']::text[], 'PETERBILT', '579', 'Automatic', 2026::int, 0::int, 'CUMMINS', true, true, true, 900.0::numeric, 208::int),
(ARRAY['03296','3296','O3296']::text[], 'KENWORTH', 'T680', 'Automatic', 2026::int, 135000::int, 'CUMMINS', false, false, true, 850.0::numeric, 182::int),
(ARRAY['4237']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'DD15', true, true, true, 900.0::numeric, 208::int),
(ARRAY['4292']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'DD15', true, true, true, 900.0::numeric, 208::int),
(ARRAY['4281']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'DD15', true, true, true, 900.0::numeric, 208::int),
(ARRAY['4286']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'CUMMINS', true, true, true, 900.0::numeric, 208::int),
(ARRAY['4280']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'CUMMINS', true, true, true, 900.0::numeric, 208::int),
(ARRAY['4248']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'DD15', true, true, true, 900.0::numeric, 208::int),
(ARRAY['4622']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 25000::int, 'DD15', false, true, true, 900.0::numeric, 191::int),
(ARRAY['4629']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 21000::int, 'DD15', false, true, true, 900.0::numeric, 191::int),
(ARRAY['04642','4642','O4642']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2025::int, 225000::int, 'DD15', false, true, true, 800.0::numeric, 156::int),
(ARRAY['4658']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 7000::int, 'DD15', true, true, true, 900.0::numeric, 208::int),
(ARRAY['4674']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 9000::int, 'DD15', true, true, true, 900.0::numeric, 208::int),
(ARRAY['4703']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'DD15', true, true, true, 900.0::numeric, 208::int),
(ARRAY['04715','4715','O4715']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 0::int, 'DD15', true, true, true, 900.0::numeric, 208::int),
(ARRAY['05458','5458','O5458']::text[], 'PETERBILT', '579', 'Automatic', 2023::int, 400000::int, 'PACCAR', false, true, true, 600.0::numeric, 130::int),
(ARRAY['5603']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 80000::int, 'DD15', false, true, true, 900.0::numeric, 182::int),
(ARRAY['5602']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 70000::int, 'DD15', false, true, true, 900.0::numeric, 182::int),
(ARRAY['5604']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 65000::int, 'DD15', true, true, true, 900.0::numeric, 182::int),
(ARRAY['5606']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 80000::int, 'DD15', true, true, true, 900.0::numeric, 182::int),
(ARRAY['05616','5616','O5616']::text[], 'VOLVO', 'VNL 760', 'Automatic', 2025::int, 140000::int, 'VOLVO D13', false, true, true, 800.0::numeric, 156::int),
(ARRAY['05645','5645','O5645']::text[], 'KENWORTH', 'T680', 'Automatic', 2023::int, 449000::int, 'PACCAR', false, true, true, 600.0::numeric, 130::int),
(ARRAY['05869','5869','O5869']::text[], 'PETERBILT', '579', 'Automatic', 2024::int, 255000::int, 'PACCAR', false, true, true, 750.0::numeric, 156::int),
(ARRAY['7317']::text[], 'VOLVO (AUTO)', 'VNL660', 'Automatic', 2026::int, 104000::int, 'VOLVO D13', false, false, false, 850.0::numeric, 182::int),
(ARRAY['07414','7414','O7414']::text[], 'VOLVO', 'VNL 760', 'Automatic', 2025::int, 212000::int, 'D13', false, true, true, 800.0::numeric, 156::int),
(ARRAY['07429','7429','O7429']::text[], 'VOLVO', 'VNL 760', 'Automatic', 2025::int, 200000::int, 'VOLVO D13', false, true, true, 750.0::numeric, 156::int),
(ARRAY['7762']::text[], 'KENWORTH', 'T680', 'Automatic', 2027::int, 7000::int, 'CUMMINS', false, true, true, 900.0::numeric, 208::int),
(ARRAY['8495']::text[], 'PETERBILT', '579', 'Automatic', 2024::int, 160000::int, 'CUMMINS', false, true, true, 800.0::numeric, 156::int),
(ARRAY['09313','9313','O9313']::text[], 'PETERBILT', '579', 'Automatic', 2025::int, 191123::int, 'CUMMINS', true, true, true, 800.0::numeric, 156::int),
(ARRAY['09498','9498','O9498']::text[], 'PETERBILT', '579', 'Automatic', 2025::int, 108662::int, 'CUMMINS', true, true, true, 850.0::numeric, 182::int),
(ARRAY['9873']::text[], 'FREIGHTLINER', 'CASCADIA', 'Automatic', 2026::int, 32000::int, 'DD15', true, true, true, 900.0::numeric, 191::int),
(ARRAY['020761','20761','O20761']::text[], 'VOLVO', 'VNL 760', 'Automatic', 2023::int, 382000::int, 'VOLVO', false, true, true, 600.0::numeric, 130::int),
(ARRAY['0241039','241039','O241039']::text[], 'MACK M&K', 'ANTHEM', 'Automatic', 2024::int, 273581::int, 'D13', false, true, true, 700.0::numeric, 156::int),
(ARRAY['0251047','251047','O251047']::text[], 'VOLVO M&K', 'VNL 760', 'Automatic', 2025::int, 240477::int, 'D13', false, true, true, 750.0::numeric, 156::int)
)
, matched AS (
  SELECT DISTINCT ON (t.id) t.id AS truck_id, t.driver1_id, d.make, d.model, d.tr, d.yr, d.mi, d.eng, d.apu, d.inv, d.frg, d.price, d.weeks
  FROM trucks t
  JOIN data d ON t.truck_number = ANY(d.variants)
)
, upd_trucks AS (
  UPDATE trucks t SET
    make = COALESCE(m.make, t.make),
    model = COALESCE(m.model, t.model),
    transmission = COALESCE(m.tr, t.transmission),
    year = COALESCE(m.yr, t.year),
    miles = COALESCE(m.mi, t.miles),
    engine = COALESCE(m.eng, t.engine),
    has_apu_webasto = COALESCE(m.apu, t.has_apu_webasto),
    has_inverter = COALESCE(m.inv, t.has_inverter),
    has_fridge = COALESCE(m.frg, t.has_fridge)
  FROM matched m WHERE t.id = m.truck_id
  RETURNING t.id
)
UPDATE drivers dr SET
  weekly_payment = COALESCE(m.price, dr.weekly_payment),
  weeks_count = COALESCE(m.weeks, dr.weeks_count)
FROM matched m
WHERE dr.id = m.driver1_id AND (m.price IS NOT NULL OR m.weeks IS NOT NULL);
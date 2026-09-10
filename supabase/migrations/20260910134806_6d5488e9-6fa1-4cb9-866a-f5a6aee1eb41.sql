-- MVR and Clearinghouse dates now mean "date the check was completed".
-- Existing values were stored as expiration dates (all in the future),
-- so shift those back one year to recover the completion date.
UPDATE public.drivers
SET mvr_date = mvr_date - INTERVAL '1 year'
WHERE mvr_date IS NOT NULL
  AND mvr_date > CURRENT_DATE;

UPDATE public.drivers
SET clearing_house = clearing_house - INTERVAL '1 year'
WHERE clearing_house IS NOT NULL
  AND clearing_house > CURRENT_DATE;

-- Format all phone numbers to (XXX) XXX-XXXX format
UPDATE drivers
SET 
  phone = CASE 
    WHEN phone IS NOT NULL AND LENGTH(regexp_replace(phone, '\D', '', 'g')) = 10 
    THEN '(' || SUBSTRING(regexp_replace(phone, '\D', '', 'g'), 1, 3) || ') ' || 
         SUBSTRING(regexp_replace(phone, '\D', '', 'g'), 4, 3) || '-' || 
         SUBSTRING(regexp_replace(phone, '\D', '', 'g'), 7, 4)
    ELSE phone
  END,
  emergency_contact_phone = CASE 
    WHEN emergency_contact_phone IS NOT NULL AND LENGTH(regexp_replace(emergency_contact_phone, '\D', '', 'g')) = 10 
    THEN '(' || SUBSTRING(regexp_replace(emergency_contact_phone, '\D', '', 'g'), 1, 3) || ') ' || 
         SUBSTRING(regexp_replace(emergency_contact_phone, '\D', '', 'g'), 4, 3) || '-' || 
         SUBSTRING(regexp_replace(emergency_contact_phone, '\D', '', 'g'), 7, 4)
    ELSE emergency_contact_phone
  END
WHERE phone IS NOT NULL OR emergency_contact_phone IS NOT NULL;

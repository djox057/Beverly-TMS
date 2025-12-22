
-- Insert test cash advances for Soraya Douglas for Dec 2-8, 2025
INSERT INTO driver_cash_advances (driver_id, amount, truck_number, requested_at)
VALUES 
  ('0d895823-0691-4e51-a235-c5e718356a8d', 50, '4649', '2025-12-02 10:00:00-06'),
  ('0d895823-0691-4e51-a235-c5e718356a8d', 75, '4649', '2025-12-04 14:30:00-06'),
  ('0d895823-0691-4e51-a235-c5e718356a8d', 25, '4649', '2025-12-06 09:00:00-06');

-- Insert test EFS other requests for Soraya Douglas for Dec 2-8, 2025
INSERT INTO efs_other_requests (driver_id, driver_name, amount, purpose, truck_number, requested_at)
VALUES 
  ('0d895823-0691-4e51-a235-c5e718356a8d', 'Soraya Douglas', 100, 'Parking', '4649', '2025-12-03 11:00:00-06'),
  ('0d895823-0691-4e51-a235-c5e718356a8d', 'Soraya Douglas', 50, 'Tolls', '4649', '2025-12-05 16:00:00-06');

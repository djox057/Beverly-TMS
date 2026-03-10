INSERT INTO dispatcher_daily_driver_counts (dispatcher_id, date, truck_count, driver_count, updated_at)
VALUES ('5dd77514-1dad-49f3-a5e1-ce447b1889ad', '2026-03-09', 6, 6, now())
ON CONFLICT (dispatcher_id, date) DO UPDATE SET driver_count = 6, truck_count = 6, updated_at = now();
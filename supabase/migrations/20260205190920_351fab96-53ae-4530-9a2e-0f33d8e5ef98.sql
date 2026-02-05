-- Add extra day for Svetozar Lazarevic-Charlie on 2026-01-10
INSERT INTO afterhours_schedule (user_id, scheduled_date) 
VALUES ('f3fd8929-19d1-4a98-9800-b3e46b4741bc', '2026-01-10')
ON CONFLICT (user_id, scheduled_date) DO NOTHING;
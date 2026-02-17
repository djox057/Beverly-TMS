-- Insert salary payment record for deleted dispatcher Nikola Plazinic-Noah for January 2026
-- This marks them as "settled" so they won't appear in future salary months
INSERT INTO dispatcher_salary_payments (user_id, month, paid_amount, paid_at, dispatcher_name, calculated_salary)
VALUES ('00000000-0000-0000-0000-000000000001', '2026-01', 0, now(), 'Nikola Plazinic-Noah', 0)
ON CONFLICT DO NOTHING;

-- Backfill dispatcher_name_snapshot for deleted dispatcher
UPDATE assignment_history 
SET dispatcher_name_snapshot = 'Milos Jankovic-Ramsey'
WHERE dispatcher_id = '41fab334-f022-4520-b19a-6550d125396f'
  AND dispatcher_name_snapshot IS NULL;

UPDATE assignment_history 
SET old_dispatcher_name_snapshot = 'Milos Jankovic-Ramsey'
WHERE old_dispatcher_id = '41fab334-f022-4520-b19a-6550d125396f'
  AND old_dispatcher_name_snapshot IS NULL;

UPDATE assignment_history 
SET changed_by_name_snapshot = 'Milos Jankovic-Ramsey'
WHERE changed_by = '41fab334-f022-4520-b19a-6550d125396f'
  AND changed_by_name_snapshot IS NULL;

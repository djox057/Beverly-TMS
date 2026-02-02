-- Insert lost days for January 2026
INSERT INTO dispatcher_off_duty_days (dispatcher_id, off_duty_date, created_by) VALUES
-- Anastasija Jankovic (Stacy) 1/8, 1/9
('1bfe690c-01ed-4cbf-aaf9-5c71ebd7c019', '2026-01-08', NULL),
('1bfe690c-01ed-4cbf-aaf9-5c71ebd7c019', '2026-01-09', NULL),
-- Katarina Golijanin (Kate) 1/15, 1/16
('7503d518-e115-4218-a7a7-fc32b205b747', '2026-01-15', NULL),
('7503d518-e115-4218-a7a7-fc32b205b747', '2026-01-16', NULL),
-- Stefan Nesovanovic (Peter) 1/5
('2a55033c-bb4d-432a-93c2-ca2379c5fe2d', '2026-01-05', NULL),
-- Bogdan Kovacevic (Brian) 1/5
('29284f1a-aad1-4458-9c4e-6264f8192047', '2026-01-05', NULL),
-- Ana Dujkic (Lucy) 1/5
('5dd77514-1dad-49f3-a5e1-ce447b1889ad', '2026-01-05', NULL),
-- Zeljka Vujic (Bella) 1/8, 1/9
('4765eb95-3660-4db2-9a43-ff7a2a2727c5', '2026-01-08', NULL),
('4765eb95-3660-4db2-9a43-ff7a2a2727c5', '2026-01-09', NULL),
-- Lazar Petrovic (Tony) 1/20
('e3863c44-743a-4516-aded-835c861f7ee2', '2026-01-20', NULL),
-- Pavle Milosevic (Will) 1/3
('4c87d878-f92f-499d-af14-3f0749bd89e5', '2026-01-03', NULL),
-- Vuk Avramovic (Carter) 1/7
('f9cd1b81-1cf7-4172-a866-df9a9cde1d03', '2026-01-07', NULL),
-- Djordje Filipovic (James) 1/6
('23d416af-cda9-4584-8778-3dc800231e3f', '2026-01-06', NULL),
-- Nikola Plazinic (Noah) 1/5
('ffcdd613-4510-4820-8907-2732b2f90f6e', '2026-01-05', NULL),
-- Dusan Sarac (Tom) 1/19
('0a2ce104-a0d3-4f07-8784-f7efc1dd6833', '2026-01-19', NULL),
-- David Mijailovic (Dom) 1/19
('d1d1a67e-2d6b-4cc1-a0b7-4c938bcc371b', '2026-01-19', NULL),
-- Novak Sarcevic (Carsen) 1/12
('1bed99da-094f-4def-9335-d118ea80179d', '2026-01-12', NULL),
-- Viktor Radovanovic (Max) 1/23
('b898ae75-4c3d-4d8f-b3f9-853b6e7d5026', '2026-01-23', NULL),
-- Djordje Babic (Jeffery) 1/9, 1/19
('d1f3c0b2-4b0a-446e-963e-081b9f73ce40', '2026-01-09', NULL),
('d1f3c0b2-4b0a-446e-963e-081b9f73ce40', '2026-01-19', NULL),
-- Jelena Veljkovic (Alice) 1/19
('c47583ba-ff4f-4586-88f6-ebcc550c0928', '2026-01-19', NULL),
-- Milan Jagodic (Michael) 1/7, 1/23
('6a321757-5cc0-41a2-80c3-737b13dd3fdb', '2026-01-07', NULL),
('6a321757-5cc0-41a2-80c3-737b13dd3fdb', '2026-01-23', NULL),
-- Milos Jankovic (Ramsey) 1/26, 1/27
('41fab334-f022-4520-b19a-6550d125396f', '2026-01-26', NULL),
('41fab334-f022-4520-b19a-6550d125396f', '2026-01-27', NULL)
ON CONFLICT (dispatcher_id, off_duty_date) DO NOTHING;

-- Insert extra days (afterhours_schedule) for January 2026
INSERT INTO afterhours_schedule (user_id, scheduled_date, created_by) VALUES
-- Katarina Golijanin (Kate) 1/20
('7503d518-e115-4218-a7a7-fc32b205b747', '2026-01-20', NULL),
-- Svetozar Lazarevic (Charlie) 1/10
('f3fd8929-19d1-4a98-9800-b3e46b4741bc', '2026-01-10', NULL),
-- Mateja Zecevic (Zack) 1/10
('2c3862d3-1531-4e76-8b1b-db4ce55cd705', '2026-01-10', NULL),
-- Vuk Jurisevic (Jerry) 1/10
('18233841-d28d-42d2-8f91-9aaac595423a', '2026-01-10', NULL),
-- Stefan Nesovanovic (Peter) 1/10
('2a55033c-bb4d-432a-93c2-ca2379c5fe2d', '2026-01-10', NULL),
-- Luka Cvetkovic (Enzo) 1/10
('14b0a11b-122d-43af-ad0d-9aa6c5bbd596', '2026-01-10', NULL),
-- Stefan Vuckovic (Paul) 1/10
('cf1c55dd-7d65-4f98-8b5b-9daeadba3547', '2026-01-10', NULL),
-- Pavle Milosevic (Will) 1/10
('4c87d878-f92f-499d-af14-3f0749bd89e5', '2026-01-10', NULL),
-- Vuk Stojkovic (Theo) 1/20
('7293080d-194b-46f0-8958-9f1aa97df13b', '2026-01-20', NULL),
-- Novak Sarcevic (Carsen) 1/10
('1bed99da-094f-4def-9335-d118ea80179d', '2026-01-10', NULL),
-- Nikola Zivkovic (Nathan) 1/10
('bcb3abb7-9ed3-44a3-87b4-abbbbb0c6af9', '2026-01-10', NULL)
ON CONFLICT DO NOTHING;
-- Revert real-time configuration changes
-- Remove tables from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE orders;
ALTER PUBLICATION supabase_realtime DROP TABLE pickup_drops;
ALTER PUBLICATION supabase_realtime DROP TABLE order_files;
ALTER PUBLICATION supabase_realtime DROP TABLE trucks;
ALTER PUBLICATION supabase_realtime DROP TABLE drivers;
ALTER PUBLICATION supabase_realtime DROP TABLE trailers;
ALTER PUBLICATION supabase_realtime DROP TABLE brokers;
ALTER PUBLICATION supabase_realtime DROP TABLE companies;
ALTER PUBLICATION supabase_realtime DROP TABLE truck_notes;
ALTER PUBLICATION supabase_realtime DROP TABLE lost_day_notes;
ALTER PUBLICATION supabase_realtime DROP TABLE assignment_history;

-- Reset REPLICA IDENTITY back to DEFAULT
ALTER TABLE orders REPLICA IDENTITY DEFAULT;
ALTER TABLE pickup_drops REPLICA IDENTITY DEFAULT;
ALTER TABLE order_files REPLICA IDENTITY DEFAULT;
ALTER TABLE trucks REPLICA IDENTITY DEFAULT;
ALTER TABLE drivers REPLICA IDENTITY DEFAULT;
ALTER TABLE trailers REPLICA IDENTITY DEFAULT;
ALTER TABLE brokers REPLICA IDENTITY DEFAULT;
ALTER TABLE companies REPLICA IDENTITY DEFAULT;
ALTER TABLE truck_notes REPLICA IDENTITY DEFAULT;
ALTER TABLE lost_day_notes REPLICA IDENTITY DEFAULT;
ALTER TABLE assignment_history REPLICA IDENTITY DEFAULT;
-- Enable real-time for all relevant tables
-- Set REPLICA IDENTITY FULL to ensure all row data is captured
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE pickup_drops REPLICA IDENTITY FULL;
ALTER TABLE order_files REPLICA IDENTITY FULL;
ALTER TABLE trucks REPLICA IDENTITY FULL;
ALTER TABLE drivers REPLICA IDENTITY FULL;
ALTER TABLE trailers REPLICA IDENTITY FULL;
ALTER TABLE brokers REPLICA IDENTITY FULL;
ALTER TABLE companies REPLICA IDENTITY FULL;
ALTER TABLE truck_notes REPLICA IDENTITY FULL;
ALTER TABLE lost_day_notes REPLICA IDENTITY FULL;
ALTER TABLE assignment_history REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE pickup_drops;
ALTER PUBLICATION supabase_realtime ADD TABLE order_files;
ALTER PUBLICATION supabase_realtime ADD TABLE trucks;
ALTER PUBLICATION supabase_realtime ADD TABLE drivers;
ALTER PUBLICATION supabase_realtime ADD TABLE trailers;
ALTER PUBLICATION supabase_realtime ADD TABLE brokers;
ALTER PUBLICATION supabase_realtime ADD TABLE companies;
ALTER PUBLICATION supabase_realtime ADD TABLE truck_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE lost_day_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE assignment_history;
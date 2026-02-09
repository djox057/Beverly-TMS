
-- Fix -1 sentinel values that leaked during deploy window
UPDATE drivers SET 
  hos_drive_minutes = NULL, 
  hos_shift_minutes = NULL, 
  hos_break_minutes = NULL, 
  hos_cycle_minutes = NULL 
WHERE hos_drive_minutes = -1;

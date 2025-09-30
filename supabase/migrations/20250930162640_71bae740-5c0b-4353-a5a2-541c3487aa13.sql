-- Step 1: Add 'driver' to the app_role enum
-- This must be done separately and committed before it can be used
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'driver';
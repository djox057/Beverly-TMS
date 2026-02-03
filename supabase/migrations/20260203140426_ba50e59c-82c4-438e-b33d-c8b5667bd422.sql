-- Add column to track if weekly plan is admin-unlocked
ALTER TABLE public.weekly_plans 
ADD COLUMN IF NOT EXISTS is_admin_unlocked BOOLEAN NOT NULL DEFAULT false;

-- Add column to track who unlocked it
ALTER TABLE public.weekly_plans 
ADD COLUMN IF NOT EXISTS unlocked_by UUID REFERENCES auth.users(id);

-- Add column to track when it was unlocked
ALTER TABLE public.weekly_plans 
ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ;
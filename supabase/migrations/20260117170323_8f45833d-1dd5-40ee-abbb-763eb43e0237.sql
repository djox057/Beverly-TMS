-- Create table for dispatcher monthly bonuses
CREATE TABLE public.dispatcher_monthly_bonuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month VARCHAR(7) NOT NULL, -- Format: 'YYYY-MM'
  dispatcher_id UUID NOT NULL,
  bonus_rank INTEGER NOT NULL CHECK (bonus_rank >= 1 AND bonus_rank <= 5),
  bonus_amount INTEGER NOT NULL CHECK (bonus_amount IN (1000, 800, 600, 400, 200)),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(month, bonus_rank), -- Each rank can only be assigned once per month
  UNIQUE(month, dispatcher_id) -- Each dispatcher can only have one bonus per month
);

-- Enable Row Level Security
ALTER TABLE public.dispatcher_monthly_bonuses ENABLE ROW LEVEL SECURITY;

-- Create policies for access
CREATE POLICY "Authenticated users can view dispatcher bonuses" 
ON public.dispatcher_monthly_bonuses 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert dispatcher bonuses" 
ON public.dispatcher_monthly_bonuses 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update dispatcher bonuses" 
ON public.dispatcher_monthly_bonuses 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete dispatcher bonuses" 
ON public.dispatcher_monthly_bonuses 
FOR DELETE 
TO authenticated
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_dispatcher_monthly_bonuses_month ON public.dispatcher_monthly_bonuses(month);

-- Add trigger for updated_at
CREATE TRIGGER update_dispatcher_monthly_bonuses_updated_at
BEFORE UPDATE ON public.dispatcher_monthly_bonuses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
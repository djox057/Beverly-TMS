
-- Create table for lost day notes
CREATE TABLE public.lost_day_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id UUID NOT NULL,
  date DATE NOT NULL,
  note TEXT NOT NULL DEFAULT 'Lost day',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE(truck_id, date)
);

-- Enable RLS
ALTER TABLE public.lost_day_notes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view lost day notes"
ON public.lost_day_notes
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create lost day notes"
ON public.lost_day_notes
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update lost day notes"
ON public.lost_day_notes
FOR UPDATE
USING (true);

CREATE POLICY "Admins can delete lost day notes"
ON public.lost_day_notes
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_lost_day_notes_updated_at
BEFORE UPDATE ON public.lost_day_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

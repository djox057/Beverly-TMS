-- Create table to track HOS requests and their Telegram message IDs
CREATE TABLE public.hos_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_message_id BIGINT NOT NULL,
  telegram_chat_id TEXT NOT NULL,
  requester_user_id UUID REFERENCES auth.users(id),
  requester_email TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  truck_number TEXT NOT NULL,
  company_name TEXT NOT NULL,
  request_type TEXT NOT NULL,
  request_details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
);

-- Enable RLS
ALTER TABLE public.hos_requests ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "System can insert hos_requests"
ON public.hos_requests
FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update hos_requests"
ON public.hos_requests
FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can view hos_requests"
ON public.hos_requests
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create index for faster lookups by telegram_message_id
CREATE INDEX idx_hos_requests_telegram_message_id ON public.hos_requests(telegram_message_id);
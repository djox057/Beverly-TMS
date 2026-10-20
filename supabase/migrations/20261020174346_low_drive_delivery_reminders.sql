CREATE TABLE public.low_drive_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  stop_id uuid NOT NULL REFERENCES public.pickup_drops(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1,
  sent_at timestamptz,
  provider_message_id text,
  email_payload jsonb,
  last_error text,
  UNIQUE(order_id,driver_id,stop_id,recipient_user_id)
);
ALTER TABLE public.low_drive_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.low_drive_reminders FROM anon,authenticated;
GRANT ALL ON public.low_drive_reminders TO service_role;
CREATE FUNCTION public.claim_low_drive_reminder(p_order uuid,p_driver uuid,p_stop uuid,p_recipient uuid)
RETURNS SETOF public.low_drive_reminders LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE claimed public.low_drive_reminders;
BEGIN
  INSERT INTO public.low_drive_reminders(order_id,driver_id,stop_id,recipient_user_id)
  VALUES(p_order,p_driver,p_stop,p_recipient) ON CONFLICT DO NOTHING RETURNING * INTO claimed;
  IF FOUND THEN RETURN NEXT claimed; RETURN; END IF;
  RETURN QUERY UPDATE public.low_drive_reminders SET claimed_at=now(),attempts=attempts+1
  WHERE order_id=p_order AND driver_id=p_driver AND stop_id=p_stop AND recipient_user_id=p_recipient
    AND sent_at IS NULL AND claimed_at<now()-interval '4 minutes'
    AND created_at>now()-interval '23 hours' AND attempts<10
  RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.claim_low_drive_reminder(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_low_drive_reminder(uuid,uuid,uuid,uuid) TO service_role;

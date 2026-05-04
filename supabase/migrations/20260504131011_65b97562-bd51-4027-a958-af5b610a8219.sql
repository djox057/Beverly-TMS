
-- Restrict realtime.messages so only operational roles can subscribe / broadcast.
-- Postgres-changes events still flow through underlying table RLS; this hardens
-- the Broadcast/Presence channel layer so drivers and unauth users can't subscribe.

DROP POLICY IF EXISTS "Operational roles can read realtime messages" ON realtime.messages;
CREATE POLICY "Operational roles can read realtime messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.has_any_role(ARRAY[
    'dispatch'::public.app_role,
    'afterhours'::public.app_role,
    'manager'::public.app_role,
    'admin'::public.app_role,
    'accounting'::public.app_role,
    'supervisor'::public.app_role,
    'safety'::public.app_role,
    'maintenance'::public.app_role,
    'chicago_management'::public.app_role,
    'yard'::public.app_role
  ])
);

DROP POLICY IF EXISTS "Operational roles can write realtime messages" ON realtime.messages;
CREATE POLICY "Operational roles can write realtime messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_any_role(ARRAY[
    'dispatch'::public.app_role,
    'afterhours'::public.app_role,
    'manager'::public.app_role,
    'admin'::public.app_role,
    'accounting'::public.app_role,
    'supervisor'::public.app_role,
    'safety'::public.app_role,
    'maintenance'::public.app_role,
    'chicago_management'::public.app_role,
    'yard'::public.app_role
  ])
);

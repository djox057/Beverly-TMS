CREATE TABLE public.user_email_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  alias_email text NOT NULL,
  primary_email text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_email_aliases_alias_email_key
  ON public.user_email_aliases (lower(alias_email));
CREATE INDEX user_email_aliases_user_id_idx
  ON public.user_email_aliases (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_email_aliases TO authenticated;
GRANT ALL ON public.user_email_aliases TO service_role;

ALTER TABLE public.user_email_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view login aliases"
  ON public.user_email_aliases FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert login aliases"
  ON public.user_email_aliases FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update login aliases"
  ON public.user_email_aliases FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete login aliases"
  ON public.user_email_aliases FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_user_email_aliases_updated_at
  BEFORE UPDATE ON public.user_email_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.resolve_login_email(p_email text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT a.primary_email
     FROM public.user_email_aliases a
     WHERE lower(a.alias_email) = lower(trim(p_email))
     LIMIT 1),
    trim(p_email)
  );
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;
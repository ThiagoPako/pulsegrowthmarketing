-- Table to store external API integrations config
CREATE TABLE public.api_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  api_type text NOT NULL DEFAULT 'rest',
  endpoint_url text DEFAULT '',
  status text NOT NULL DEFAULT 'inativo',
  last_checked_at timestamptz,
  last_error text,
  config jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage api integrations" ON public.api_integrations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Table for chat history
CREATE TABLE public.financial_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage own chat" ON public.financial_chat_messages
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

-- API integration logs for audit
CREATE TABLE public.api_integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.api_integrations(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'success',
  details jsonb,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_integration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage api logs" ON public.api_integration_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Tabela de eventos dos clientes
CREATE TABLE public.client_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  event_date date NOT NULL,
  event_time text NOT NULL DEFAULT '08:00',
  event_end_time text DEFAULT '18:00',
  location text DEFAULT '',
  color text DEFAULT '217 91% 60%',
  max_registrations integer DEFAULT NULL,
  status text NOT NULL DEFAULT 'ativo',
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  banner_url text DEFAULT NULL,
  send_coupons_to_participants boolean NOT NULL DEFAULT false,
  linked_campaign_id uuid REFERENCES public.discount_campaigns(id) DEFAULT NULL,
  created_by uuid DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_events ENABLE ROW LEVEL SECURITY;

-- Anon pode ver eventos ativos pelo token
CREATE POLICY "anon_view_active_events" ON public.client_events
  FOR SELECT TO anon USING (status = 'ativo');

-- Auth pode ver todos
CREATE POLICY "auth_view_events" ON public.client_events
  FOR SELECT TO authenticated USING (true);

-- Admin gerencia tudo
CREATE POLICY "admin_manage_events" ON public.client_events
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Social media gerencia
CREATE POLICY "social_media_manage_events" ON public.client_events
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

-- Tabela de inscrições
CREATE TABLE public.event_registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.client_events(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  age integer NOT NULL DEFAULT 0,
  whatsapp text NOT NULL DEFAULT '',
  lgpd_accepted boolean NOT NULL DEFAULT false,
  registration_code text NOT NULL DEFAULT encode(extensions.gen_random_bytes(6), 'hex'),
  coupon_sent boolean NOT NULL DEFAULT false,
  coupon_id uuid REFERENCES public.discount_coupons(id) DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

-- Anon pode se inscrever
CREATE POLICY "anon_insert_registrations" ON public.event_registrations
  FOR INSERT TO anon WITH CHECK (true);

-- Anon pode ver própria inscrição pelo código
CREATE POLICY "anon_view_registrations" ON public.event_registrations
  FOR SELECT TO anon USING (true);

-- Auth pode ver todas
CREATE POLICY "auth_view_registrations" ON public.event_registrations
  FOR SELECT TO authenticated USING (true);

-- Admin gerencia
CREATE POLICY "admin_manage_registrations" ON public.event_registrations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Social media gerencia
CREATE POLICY "social_media_manage_registrations" ON public.event_registrations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

-- Index para busca por token
CREATE INDEX idx_client_events_token ON public.client_events(token);
CREATE INDEX idx_event_registrations_event_id ON public.event_registrations(event_id);

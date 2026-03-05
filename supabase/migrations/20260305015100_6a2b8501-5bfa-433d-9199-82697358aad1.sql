
-- WhatsApp config table
CREATE TABLE public.whatsapp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_token_configured boolean NOT NULL DEFAULT false,
  integration_active boolean NOT NULL DEFAULT false,
  default_user_id text NOT NULL DEFAULT '',
  default_queue_id text NOT NULL DEFAULT '',
  send_signature boolean NOT NULL DEFAULT false,
  close_ticket boolean NOT NULL DEFAULT false,
  auto_recording_scheduled boolean NOT NULL DEFAULT true,
  auto_recording_reminder boolean NOT NULL DEFAULT true,
  auto_video_approval boolean NOT NULL DEFAULT true,
  auto_video_approved boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view whatsapp config" ON public.whatsapp_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage whatsapp config" ON public.whatsapp_config FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default config
INSERT INTO public.whatsapp_config (api_token_configured, integration_active) VALUES (false, false);

-- WhatsApp messages table
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  api_response jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid REFERENCES auth.users(id),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  trigger_type text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view whatsapp messages" ON public.whatsapp_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage whatsapp messages" ON public.whatsapp_messages FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can insert whatsapp messages" ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK (true);

-- Add whatsapp column to clients
ALTER TABLE public.clients ADD COLUMN whatsapp text NOT NULL DEFAULT '';

-- Enable realtime for whatsapp_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;

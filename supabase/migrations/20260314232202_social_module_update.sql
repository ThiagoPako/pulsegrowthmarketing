-- Create integration settings table
CREATE TABLE IF NOT EXISTS public.integration_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  meta_access_token text,
  instagram_business_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage integration settings" ON public.integration_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Social Media manage integration settings" ON public.integration_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

-- Add caption and media_url to social_media_deliveries
ALTER TABLE public.social_media_deliveries ADD COLUMN IF NOT EXISTS caption text;
ALTER TABLE public.social_media_deliveries ADD COLUMN IF NOT EXISTS media_url text;

-- Update valid statuses (just visual/logical enum, but good practice to document if not using PG ENUMs)
-- Supported status: 'rascunho', 'revisao', 'aprovado_agendado', 'postado'

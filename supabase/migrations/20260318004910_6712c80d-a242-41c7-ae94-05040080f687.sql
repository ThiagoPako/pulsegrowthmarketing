
-- Add has_vehicle_flyer to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS has_vehicle_flyer boolean NOT NULL DEFAULT false;

-- Flyer templates table (admin uploads frames, intro videos, base music)
CREATE TABLE public.flyer_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  template_type text NOT NULL DEFAULT 'frame', -- 'frame', 'intro_video', 'base_music'
  file_url text NOT NULL DEFAULT '',
  preview_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flyer_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage flyer templates" ON public.flyer_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated view flyer templates" ON public.flyer_templates
  FOR SELECT TO authenticated
  USING (true);

-- Generated flyers table (stores client-created flyers)
CREATE TABLE public.flyer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.flyer_templates(id) ON DELETE SET NULL,
  vehicle_model text NOT NULL DEFAULT '',
  vehicle_year text NOT NULL DEFAULT '',
  transmission text NOT NULL DEFAULT 'manual', -- 'manual', 'automatico'
  fuel_type text NOT NULL DEFAULT 'flex', -- 'flex', 'gasolina', 'etanol', 'diesel', 'eletrico', 'hibrido'
  tire_condition text NOT NULL DEFAULT 'bom', -- 'bom', 'regular', 'novo'
  price text NOT NULL DEFAULT '',
  extra_info text,
  media_urls text[] NOT NULL DEFAULT '{}',
  generated_image_url text,
  generated_video_url text,
  status text NOT NULL DEFAULT 'rascunho', -- 'rascunho', 'gerado', 'baixado'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flyer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage flyer items" ON public.flyer_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated view flyer items" ON public.flyer_items
  FOR SELECT TO authenticated
  USING (true);

-- Allow public insert for client portal (no auth)
CREATE POLICY "Public insert flyer items" ON public.flyer_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Public update own flyer items" ON public.flyer_items
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Social media manage flyer items" ON public.flyer_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

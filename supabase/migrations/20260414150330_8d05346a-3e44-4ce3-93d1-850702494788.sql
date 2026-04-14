
-- Training presentations table
CREATE TABLE public.training_presentations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'rascunho',
  cover_color TEXT DEFAULT '217 91% 60%',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Training slides table
CREATE TABLE public.training_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id UUID NOT NULL REFERENCES public.training_presentations(id) ON DELETE CASCADE,
  slide_order INTEGER NOT NULL DEFAULT 0,
  title TEXT DEFAULT '',
  subtitle TEXT DEFAULT '',
  content TEXT DEFAULT '',
  image_url TEXT,
  background_color TEXT DEFAULT '217 91% 60%',
  text_color TEXT DEFAULT '0 0% 100%',
  layout_type TEXT NOT NULL DEFAULT 'title_content',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.training_presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_slides ENABLE ROW LEVEL SECURITY;

-- Presentations policies
CREATE POLICY "auth_view_training_presentations" ON public.training_presentations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_manage_training_presentations" ON public.training_presentations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "social_media_manage_training_presentations" ON public.training_presentations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

CREATE POLICY "anon_view_published_presentations" ON public.training_presentations
  FOR SELECT TO anon USING (status = 'publicado');

-- Slides policies
CREATE POLICY "auth_view_training_slides" ON public.training_slides
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_manage_training_slides" ON public.training_slides
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "social_media_manage_training_slides" ON public.training_slides
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

CREATE POLICY "anon_view_training_slides" ON public.training_slides
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM public.training_presentations tp
      WHERE tp.id = presentation_id AND tp.status = 'publicado'
    )
  );

-- Indexes
CREATE INDEX idx_training_presentations_client ON public.training_presentations(client_id);
CREATE INDEX idx_training_slides_presentation ON public.training_slides(presentation_id);
CREATE INDEX idx_training_slides_order ON public.training_slides(presentation_id, slide_order);

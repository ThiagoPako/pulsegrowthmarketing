
-- Storage bucket for client content (videos, images)
INSERT INTO storage.buckets (id, name, public) VALUES ('client-content', 'client-content', true);

-- Storage policies
CREATE POLICY "Public can view content files" ON storage.objects FOR SELECT USING (bucket_id = 'client-content');
CREATE POLICY "Authenticated can upload content files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'client-content');
CREATE POLICY "Authenticated can update content files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'client-content');
CREATE POLICY "Authenticated can delete content files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'client-content');

-- Portal contents table
CREATE TABLE public.client_portal_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT 'reel',
  season_month integer NOT NULL,
  season_year integer NOT NULL,
  file_url text,
  thumbnail_url text,
  duration_seconds integer DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  uploaded_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_portal_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_view_portal_contents" ON public.client_portal_contents FOR SELECT TO anon USING (true);
CREATE POLICY "auth_view_portal_contents" ON public.client_portal_contents FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_manage_portal_contents" ON public.client_portal_contents FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "editor_manage_portal_contents" ON public.client_portal_contents FOR ALL TO authenticated USING (has_role(auth.uid(), 'editor'::app_role)) WITH CHECK (has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "social_media_manage_portal_contents" ON public.client_portal_contents FOR ALL TO authenticated USING (has_role(auth.uid(), 'social_media'::app_role)) WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));
CREATE POLICY "anon_update_portal_contents" ON public.client_portal_contents FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Portal comments table
CREATE TABLE public.client_portal_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid REFERENCES public.client_portal_contents(id) ON DELETE CASCADE NOT NULL,
  author_name text NOT NULL DEFAULT '',
  author_type text NOT NULL DEFAULT 'client',
  author_id uuid REFERENCES public.profiles(id),
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_portal_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_view_portal_comments" ON public.client_portal_comments FOR SELECT TO anon USING (true);
CREATE POLICY "auth_view_portal_comments" ON public.client_portal_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "anon_insert_portal_comments" ON public.client_portal_comments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "auth_manage_portal_comments" ON public.client_portal_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Performance indexes
CREATE INDEX idx_portal_contents_client ON public.client_portal_contents(client_id);
CREATE INDEX idx_portal_contents_season ON public.client_portal_contents(season_year, season_month);
CREATE INDEX idx_portal_comments_content ON public.client_portal_comments(content_id);


CREATE TABLE public.portal_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_type text NOT NULL DEFAULT 'welcome', -- 'welcome' or 'news'
  title text NOT NULL DEFAULT '',
  description text,
  video_url text NOT NULL DEFAULT '',
  thumbnail_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.portal_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage portal videos" ON public.portal_videos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated view portal videos" ON public.portal_videos
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Anon view active portal videos" ON public.portal_videos
  FOR SELECT TO anon
  USING (is_active = true);

-- Track which clients have seen which videos
CREATE TABLE public.portal_video_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.portal_videos(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(video_id, client_id)
);

ALTER TABLE public.portal_video_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone manage portal video views" ON public.portal_video_views
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon manage portal video views" ON public.portal_video_views
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);


-- Clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  responsible_person TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '217 91% 60%',
  fixed_day TEXT NOT NULL DEFAULT 'segunda',
  fixed_time TEXT NOT NULL DEFAULT '09:00',
  videomaker_id UUID REFERENCES public.profiles(id),
  backup_time TEXT NOT NULL DEFAULT '14:00',
  backup_day TEXT NOT NULL DEFAULT 'terca',
  extra_day TEXT NOT NULL DEFAULT 'quarta',
  extra_content_types TEXT[] NOT NULL DEFAULT '{}',
  accepts_extra BOOLEAN NOT NULL DEFAULT false,
  extra_client_appears BOOLEAN NOT NULL DEFAULT false,
  weekly_reels INTEGER NOT NULL DEFAULT 0,
  weekly_creatives INTEGER NOT NULL DEFAULT 0,
  weekly_goal INTEGER NOT NULL DEFAULT 10,
  has_endomarketing BOOLEAN NOT NULL DEFAULT false,
  weekly_stories INTEGER NOT NULL DEFAULT 0,
  presence_days INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recordings table
CREATE TABLE public.recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  videomaker_id UUID NOT NULL REFERENCES public.profiles(id),
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'fixa',
  status TEXT NOT NULL DEFAULT 'agendada',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kanban tasks table
CREATE TABLE public.kanban_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  "column" TEXT NOT NULL DEFAULT 'backlog',
  checklist JSONB NOT NULL DEFAULT '[]',
  week_start DATE NOT NULL,
  recording_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scripts table
CREATE TABLE public.scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  video_type TEXT NOT NULL DEFAULT 'vendas',
  content TEXT NOT NULL DEFAULT '',
  recorded BOOLEAN NOT NULL DEFAULT false,
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Company settings (single row)
CREATE TABLE public.company_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  start_time TEXT NOT NULL DEFAULT '08:00',
  end_time TEXT NOT NULL DEFAULT '18:00',
  work_days TEXT[] NOT NULL DEFAULT '{segunda,terca,quarta,quinta,sexta}',
  recording_duration INTEGER NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default settings row
INSERT INTO public.company_settings (id) VALUES (gen_random_uuid());

-- Active recordings table
CREATE TABLE public.active_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  videomaker_id UUID NOT NULL REFERENCES public.profiles(id),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(recording_id)
);

-- Enable RLS on all tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_recordings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Authenticated can SELECT all
CREATE POLICY "Authenticated can view clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can view recordings" ON public.recordings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can view tasks" ON public.kanban_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can view scripts" ON public.scripts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can view settings" ON public.company_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can view active recordings" ON public.active_recordings FOR SELECT TO authenticated USING (true);

-- Admin can do everything
CREATE POLICY "Admin manage clients" ON public.clients FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin manage recordings" ON public.recordings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin manage tasks" ON public.kanban_tasks FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin manage scripts" ON public.scripts FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin manage settings" ON public.company_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin manage active recordings" ON public.active_recordings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Videomakers can insert/update recordings and active_recordings
CREATE POLICY "Videomaker manage own recordings" ON public.recordings FOR ALL TO authenticated USING (videomaker_id = auth.uid()) WITH CHECK (videomaker_id = auth.uid());
CREATE POLICY "Videomaker manage own active recordings" ON public.active_recordings FOR ALL TO authenticated USING (videomaker_id = auth.uid()) WITH CHECK (videomaker_id = auth.uid());

-- Social media can manage tasks and scripts
CREATE POLICY "Social media manage tasks" ON public.kanban_tasks FOR ALL TO authenticated USING (has_role(auth.uid(), 'social_media')) WITH CHECK (has_role(auth.uid(), 'social_media'));
CREATE POLICY "Social media manage scripts" ON public.scripts FOR ALL TO authenticated USING (has_role(auth.uid(), 'social_media')) WITH CHECK (has_role(auth.uid(), 'social_media'));

-- Editor can manage scripts
CREATE POLICY "Editor manage scripts" ON public.scripts FOR ALL TO authenticated USING (has_role(auth.uid(), 'editor')) WITH CHECK (has_role(auth.uid(), 'editor'));

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recordings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scripts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_recordings;

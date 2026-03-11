
-- Create design_tasks table
CREATE TABLE public.design_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  format_type TEXT NOT NULL DEFAULT 'feed',
  kanban_column TEXT NOT NULL DEFAULT 'nova_tarefa',
  priority TEXT NOT NULL DEFAULT 'media',
  copy_text TEXT,
  references_links TEXT[],
  reference_images TEXT[],
  attachment_url TEXT,
  editable_file_url TEXT,
  observations TEXT,
  created_by UUID,
  assigned_to UUID,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  sent_to_client_at TIMESTAMPTZ,
  client_approved_at TIMESTAMPTZ,
  auto_approved BOOLEAN NOT NULL DEFAULT false,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  timer_running BOOLEAN NOT NULL DEFAULT false,
  timer_started_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create design_task_history for versions, comments, adjustments
CREATE TABLE public.design_task_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.design_tasks(id) ON DELETE CASCADE,
  action TEXT NOT NULL DEFAULT '',
  details TEXT,
  attachment_url TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for design_tasks
ALTER TABLE public.design_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_task_history ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin manage design tasks" ON public.design_tasks FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Social media full access
CREATE POLICY "Social media manage design tasks" ON public.design_tasks FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

-- Fotografo (designer) full access
CREATE POLICY "Designer manage design tasks" ON public.design_tasks FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'fotografo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'fotografo'::app_role));

-- All authenticated can view
CREATE POLICY "Authenticated view design tasks" ON public.design_tasks FOR SELECT TO authenticated
  USING (true);

-- History policies
CREATE POLICY "Admin manage design history" ON public.design_task_history FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated insert design history" ON public.design_task_history FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated view design history" ON public.design_task_history FOR SELECT TO authenticated
  USING (true);

-- Storage bucket for design files
INSERT INTO storage.buckets (id, name, public) VALUES ('design-files', 'design-files', true);

-- Storage RLS
CREATE POLICY "Authenticated can upload design files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'design-files');

CREATE POLICY "Anyone can view design files" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'design-files');

CREATE POLICY "Authenticated can update design files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'design-files');

CREATE POLICY "Authenticated can delete design files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'design-files');


-- Add new columns to content_tasks for editor workflow
ALTER TABLE public.content_tasks 
  ADD COLUMN IF NOT EXISTS edited_video_link text,
  ADD COLUMN IF NOT EXISTS edited_video_type text DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS approval_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS adjustment_notes text;

-- Create task_comments table
CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.content_tasks(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view task comments" ON public.task_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert task comments" ON public.task_comments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admin manage task comments" ON public.task_comments
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create task_history table for audit trail
CREATE TABLE public.task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.content_tasks(id) ON DELETE CASCADE NOT NULL,
  user_id uuid,
  action text NOT NULL DEFAULT '',
  details text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view task history" ON public.task_history
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert task history" ON public.task_history
  FOR INSERT TO authenticated WITH CHECK (true);

-- Enable realtime for comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;

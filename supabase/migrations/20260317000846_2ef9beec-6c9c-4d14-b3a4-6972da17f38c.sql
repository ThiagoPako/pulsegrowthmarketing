
-- Add caption column to scripts table
ALTER TABLE public.scripts ADD COLUMN IF NOT EXISTS caption text DEFAULT '';

-- Create traffic_campaigns table
CREATE TABLE public.traffic_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  design_task_id uuid REFERENCES public.design_tasks(id) ON DELETE SET NULL,
  content_task_id uuid REFERENCES public.content_tasks(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT 'criativo',
  campaign_start_date date,
  campaign_end_date date,
  status text NOT NULL DEFAULT 'ativo',
  budget numeric DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.traffic_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_traffic_campaigns" ON public.traffic_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "social_media_manage_traffic_campaigns" ON public.traffic_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'social_media'))
  WITH CHECK (public.has_role(auth.uid(), 'social_media'));

CREATE POLICY "auth_view_traffic_campaigns" ON public.traffic_campaigns
  FOR SELECT TO authenticated
  USING (true);

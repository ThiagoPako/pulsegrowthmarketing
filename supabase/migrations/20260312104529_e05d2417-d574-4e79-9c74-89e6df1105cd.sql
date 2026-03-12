
-- Table for portal notifications (visible to clients without auth)
CREATE TABLE public.client_portal_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'info',
  link_content_id UUID REFERENCES public.client_portal_contents(id) ON DELETE SET NULL,
  link_script_id UUID REFERENCES public.scripts(id) ON DELETE SET NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_portal_notifications ENABLE ROW LEVEL SECURITY;

-- Anon can view and update (mark as read) notifications for the portal
CREATE POLICY "anon_view_portal_notifications" ON public.client_portal_notifications
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update_portal_notifications" ON public.client_portal_notifications
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Authenticated can manage all
CREATE POLICY "auth_manage_portal_notifications" ON public.client_portal_notifications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

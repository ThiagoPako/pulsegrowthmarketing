
CREATE TABLE IF NOT EXISTS public.script_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  topic text NOT NULL,
  notes text,
  content_format text NOT NULL DEFAULT 'reels',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','cancelled')),
  priority text NOT NULL DEFAULT 'alta' CHECK (priority IN ('alta','normal')),
  requested_by uuid,
  requested_by_name text,
  fulfilled_script_id uuid REFERENCES public.scripts(id) ON DELETE SET NULL,
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.script_requests TO authenticated;
GRANT ALL ON public.script_requests TO service_role;

ALTER TABLE public.script_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can view script_requests" ON public.script_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert script_requests" ON public.script_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update script_requests" ON public.script_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin can delete script_requests" ON public.script_requests FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_script_requests_updated_at
BEFORE UPDATE ON public.script_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS script_requests_status_idx ON public.script_requests(status);
CREATE INDEX IF NOT EXISTS script_requests_client_id_idx ON public.script_requests(client_id);

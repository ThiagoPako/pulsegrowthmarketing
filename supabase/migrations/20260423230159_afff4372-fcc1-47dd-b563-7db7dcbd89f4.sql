-- Histórico de versões do briefing
CREATE TABLE IF NOT EXISTS public.briefing_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  briefing_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  editorial TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, version)
);

CREATE INDEX IF NOT EXISTS idx_briefing_versions_client ON public.briefing_versions(client_id, version DESC);

ALTER TABLE public.briefing_versions ENABLE ROW LEVEL SECURITY;

-- Admin e social_media podem visualizar todas as versões
CREATE POLICY "Admins and social_media can view briefing versions"
  ON public.briefing_versions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'social_media'));

-- Apenas admin pode deletar (limpeza)
CREATE POLICY "Admins can delete briefing versions"
  ON public.briefing_versions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- INSERT é feito pela VPS via service role / pool direto, sem RLS
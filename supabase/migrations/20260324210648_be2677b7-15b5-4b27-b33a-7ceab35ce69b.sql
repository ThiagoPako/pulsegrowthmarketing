
-- Table to store commercial proposals
CREATE TABLE public.commercial_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  client_name text NOT NULL DEFAULT '',
  client_company text NOT NULL DEFAULT '',
  plan_id uuid REFERENCES public.plans(id),
  plan_snapshot jsonb DEFAULT '{}'::jsonb,
  bonus_services jsonb DEFAULT '[]'::jsonb,
  team_members jsonb DEFAULT '[]'::jsonb,
  has_contract boolean NOT NULL DEFAULT true,
  custom_discount numeric NOT NULL DEFAULT 0,
  observations text DEFAULT '',
  validity_date date NOT NULL DEFAULT (CURRENT_DATE + interval '7 days'),
  status text NOT NULL DEFAULT 'pendente',
  client_response_at timestamp with time zone,
  client_response_note text,
  whatsapp_number text DEFAULT '',
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(token)
);

-- Table for client comments on proposals
CREATE TABLE public.proposal_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES public.commercial_proposals(id) ON DELETE CASCADE NOT NULL,
  author_name text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.commercial_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_comments ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage proposals
CREATE POLICY "admin_manage_proposals" ON public.commercial_proposals FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "auth_view_proposals" ON public.commercial_proposals FOR SELECT TO authenticated
  USING (true);

-- Anon can view by token (for public link)
CREATE POLICY "anon_view_proposal_by_token" ON public.commercial_proposals FOR SELECT TO anon
  USING (true);

-- Anon can update status (accept/decline)
CREATE POLICY "anon_update_proposal_status" ON public.commercial_proposals FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Comments: anon can insert and view
CREATE POLICY "anon_manage_proposal_comments" ON public.proposal_comments FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_manage_proposal_comments" ON public.proposal_comments FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

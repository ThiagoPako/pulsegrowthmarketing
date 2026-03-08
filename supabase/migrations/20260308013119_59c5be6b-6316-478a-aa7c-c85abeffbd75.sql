
-- Endomarketing Packages
CREATE TABLE public.endomarketing_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  package_name text NOT NULL,
  description text DEFAULT '',
  partner_cost numeric NOT NULL DEFAULT 0,
  sessions_per_week integer NOT NULL DEFAULT 0,
  stories_per_day integer NOT NULL DEFAULT 0,
  duration_hours numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.endomarketing_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_view_endo_packages" ON public.endomarketing_packages FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_manage_endo_packages" ON public.endomarketing_packages FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Client Endomarketing Contracts
CREATE TABLE public.client_endomarketing_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.endomarketing_packages(id),
  partner_id uuid REFERENCES public.profiles(id),
  partner_cost numeric NOT NULL DEFAULT 0,
  sale_price numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_endomarketing_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_view_endo_contracts" ON public.client_endomarketing_contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_manage_endo_contracts" ON public.client_endomarketing_contracts FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "endo_manage_endo_contracts" ON public.client_endomarketing_contracts FOR ALL TO authenticated USING (has_role(auth.uid(), 'endomarketing'::app_role)) WITH CHECK (has_role(auth.uid(), 'endomarketing'::app_role));

-- Endomarketing Partner Tasks
CREATE TABLE public.endomarketing_partner_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.client_endomarketing_contracts(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  partner_id uuid REFERENCES public.profiles(id),
  date date NOT NULL,
  start_time text,
  duration_minutes integer NOT NULL DEFAULT 60,
  task_type text NOT NULL DEFAULT 'presenca',
  status text NOT NULL DEFAULT 'pendente',
  notes text,
  attachment_url text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.endomarketing_partner_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_view_endo_partner_tasks" ON public.endomarketing_partner_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_manage_endo_partner_tasks" ON public.endomarketing_partner_tasks FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "endo_manage_endo_partner_tasks" ON public.endomarketing_partner_tasks FOR ALL TO authenticated USING (has_role(auth.uid(), 'endomarketing'::app_role)) WITH CHECK (has_role(auth.uid(), 'endomarketing'::app_role));
CREATE POLICY "partner_manage_own_endo_tasks" ON public.endomarketing_partner_tasks FOR ALL TO authenticated USING (partner_id = auth.uid()) WITH CHECK (partner_id = auth.uid());

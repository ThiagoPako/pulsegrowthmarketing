
-- Expense categories table
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view expense categories" ON public.expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage expense categories" ON public.expense_categories FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default categories
INSERT INTO public.expense_categories (name) VALUES
  ('Salários'), ('Freelancers'), ('Tráfego Pago'), ('Equipamentos'),
  ('Softwares'), ('Transporte'), ('Impostos'), ('Marketing'), ('Outros');

-- Financial contracts table
CREATE TABLE public.financial_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id),
  contract_value numeric NOT NULL DEFAULT 0,
  contract_start_date date NOT NULL DEFAULT CURRENT_DATE,
  due_day integer NOT NULL DEFAULT 10,
  payment_method text NOT NULL DEFAULT 'pix',
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.financial_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view contracts" ON public.financial_contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage contracts" ON public.financial_contracts FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Monthly revenues (invoices)
CREATE TABLE public.revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.financial_contracts(id) ON DELETE CASCADE,
  reference_month date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'prevista',
  paid_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.revenues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view revenues" ON public.revenues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage revenues" ON public.revenues FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Expenses table
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  category_id uuid NOT NULL REFERENCES public.expense_categories(id),
  expense_type text NOT NULL DEFAULT 'fixa',
  description text NOT NULL DEFAULT '',
  responsible text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view expenses" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage expenses" ON public.expenses FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Payment configuration (company PIX info etc)
CREATE TABLE public.payment_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pix_key text NOT NULL DEFAULT '',
  receiver_name text NOT NULL DEFAULT '',
  bank text NOT NULL DEFAULT '',
  document text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view payment config" ON public.payment_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage payment config" ON public.payment_config FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default payment config
INSERT INTO public.payment_config (pix_key, receiver_name, bank, document) VALUES ('', '', '', '');

-- Billing messages log
CREATE TABLE public.billing_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_id uuid REFERENCES public.revenues(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  message_type text NOT NULL DEFAULT 'cobranca',
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'enviada'
);

ALTER TABLE public.billing_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view billing messages" ON public.billing_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage billing messages" ON public.billing_messages FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

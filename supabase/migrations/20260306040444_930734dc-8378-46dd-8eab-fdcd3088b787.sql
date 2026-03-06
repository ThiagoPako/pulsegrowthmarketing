
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'clients', -- 'clients', 'faturamento', 'lucro'
  title text NOT NULL DEFAULT '',
  target_value numeric NOT NULL DEFAULT 0,
  current_value numeric NOT NULL DEFAULT 0,
  period text NOT NULL DEFAULT 'mensal', -- 'semanal', 'mensal', 'trimestral', 'anual'
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL DEFAULT (CURRENT_DATE + interval '30 days'),
  status text NOT NULL DEFAULT 'em_andamento', -- 'em_andamento', 'concluida', 'cancelada'
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage goals" ON public.goals FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view goals" ON public.goals FOR SELECT TO authenticated
  USING (true);

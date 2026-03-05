
CREATE TABLE public.cash_reserve_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'entrada',
  description text NOT NULL DEFAULT '',
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_reserve_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage cash reserve" ON public.cash_reserve_movements
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view cash reserve" ON public.cash_reserve_movements
  FOR SELECT TO authenticated
  USING (true);

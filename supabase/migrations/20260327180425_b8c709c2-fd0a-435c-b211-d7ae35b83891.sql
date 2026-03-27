
CREATE TABLE public.salary_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL,
  user_name text NOT NULL DEFAULT '',
  user_role text NOT NULL DEFAULT '',
  bonus_amount numeric NOT NULL DEFAULT 0,
  reference_month text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.salary_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage salary bonuses" ON public.salary_bonuses
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated view salary bonuses" ON public.salary_bonuses
  FOR SELECT TO authenticated
  USING (true);

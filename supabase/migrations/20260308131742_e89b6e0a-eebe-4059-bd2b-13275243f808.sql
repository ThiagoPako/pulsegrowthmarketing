
-- Add parceiro RLS policies matching endomarketing on endomarketing_agendamentos
CREATE POLICY "parceiro_view_endo_schedules"
  ON public.endomarketing_agendamentos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "parceiro_manage_endo_schedules"
  ON public.endomarketing_agendamentos FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'parceiro'::app_role))
  WITH CHECK (has_role(auth.uid(), 'parceiro'::app_role));

-- Add parceiro to endomarketing_clientes management
CREATE POLICY "parceiro_manage_endo_clients"
  ON public.endomarketing_clientes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'parceiro'::app_role))
  WITH CHECK (has_role(auth.uid(), 'parceiro'::app_role));

-- Add parceiro to endomarketing_contracts management (view only, no create - matching UI restriction)
CREATE POLICY "parceiro_manage_endo_contracts"
  ON public.client_endomarketing_contracts FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'parceiro'::app_role))
  WITH CHECK (has_role(auth.uid(), 'parceiro'::app_role));

-- Add parceiro to endomarketing_logs insert
CREATE POLICY "parceiro_insert_endo_logs"
  ON public.endomarketing_logs FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'parceiro'::app_role));

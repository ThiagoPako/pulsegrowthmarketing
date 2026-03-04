
-- Allow anon/authenticated to insert into endomarketing tables during transition period
CREATE POLICY "Allow insert endo clients" ON public.endomarketing_clientes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow insert endo agendamentos" ON public.endomarketing_agendamentos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update endo clients" ON public.endomarketing_clientes
  FOR UPDATE USING (true);

CREATE POLICY "Allow delete endo clients" ON public.endomarketing_clientes
  FOR DELETE USING (true);

CREATE POLICY "Allow update endo agendamentos" ON public.endomarketing_agendamentos
  FOR UPDATE USING (true);

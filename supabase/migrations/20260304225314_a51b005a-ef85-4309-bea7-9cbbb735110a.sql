
-- Allow anon to read endomarketing tables during transition
CREATE POLICY "Allow anon select endo clients" ON public.endomarketing_clientes
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon select endo agendamentos" ON public.endomarketing_agendamentos
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon select endo profissionais" ON public.endomarketing_profissionais
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon select endo logs" ON public.endomarketing_logs
  FOR SELECT TO anon USING (true);

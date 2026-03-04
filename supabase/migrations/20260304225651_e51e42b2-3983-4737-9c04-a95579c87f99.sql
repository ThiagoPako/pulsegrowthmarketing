
-- Drop all permissive/anon transition policies
DROP POLICY IF EXISTS "Allow insert endo clients" ON public.endomarketing_clientes;
DROP POLICY IF EXISTS "Allow update endo clients" ON public.endomarketing_clientes;
DROP POLICY IF EXISTS "Allow delete endo clients" ON public.endomarketing_clientes;
DROP POLICY IF EXISTS "Allow anon select endo clients" ON public.endomarketing_clientes;
DROP POLICY IF EXISTS "Allow insert endo agendamentos" ON public.endomarketing_agendamentos;
DROP POLICY IF EXISTS "Allow update endo agendamentos" ON public.endomarketing_agendamentos;
DROP POLICY IF EXISTS "Allow anon select endo agendamentos" ON public.endomarketing_agendamentos;
DROP POLICY IF EXISTS "Allow anon select endo profissionais" ON public.endomarketing_profissionais;
DROP POLICY IF EXISTS "Allow anon select endo logs" ON public.endomarketing_logs;

-- Drop old auth-based policies too (will recreate)
DROP POLICY IF EXISTS "Auth users can view endo clients" ON public.endomarketing_clientes;
DROP POLICY IF EXISTS "Admins and endo can manage endo clients" ON public.endomarketing_clientes;
DROP POLICY IF EXISTS "Auth users can view endo schedules" ON public.endomarketing_agendamentos;
DROP POLICY IF EXISTS "Admins and endo can manage schedules" ON public.endomarketing_agendamentos;
DROP POLICY IF EXISTS "Auth users can view endo pros" ON public.endomarketing_profissionais;
DROP POLICY IF EXISTS "Admins can manage endo pros" ON public.endomarketing_profissionais;
DROP POLICY IF EXISTS "Auth users can view endo logs" ON public.endomarketing_logs;
DROP POLICY IF EXISTS "Admins and endo can insert logs" ON public.endomarketing_logs;

-- ═══ ENDOMARKETING_CLIENTES ═══
CREATE POLICY "Authenticated can view endo clients"
  ON public.endomarketing_clientes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin/endo can insert endo clients"
  ON public.endomarketing_clientes FOR INSERT
  TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'endomarketing')
  );

CREATE POLICY "Admin/endo can update endo clients"
  ON public.endomarketing_clientes FOR UPDATE
  TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'endomarketing')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'endomarketing')
  );

CREATE POLICY "Admin/endo can delete endo clients"
  ON public.endomarketing_clientes FOR DELETE
  TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'endomarketing')
  );

-- ═══ ENDOMARKETING_AGENDAMENTOS ═══
CREATE POLICY "Authenticated can view endo schedules"
  ON public.endomarketing_agendamentos FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin/endo can insert endo schedules"
  ON public.endomarketing_agendamentos FOR INSERT
  TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'endomarketing')
  );

CREATE POLICY "Admin/endo can update endo schedules"
  ON public.endomarketing_agendamentos FOR UPDATE
  TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'endomarketing')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'endomarketing')
  );

-- ═══ ENDOMARKETING_PROFISSIONAIS ═══
CREATE POLICY "Authenticated can view endo pros"
  ON public.endomarketing_profissionais FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin can manage endo pros"
  ON public.endomarketing_profissionais FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ═══ ENDOMARKETING_LOGS ═══
CREATE POLICY "Authenticated can view endo logs"
  ON public.endomarketing_logs FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin/endo can insert endo logs"
  ON public.endomarketing_logs FOR INSERT
  TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'endomarketing')
  );


-- Allow anonymous users to view scripts (needed for client portal Zona Criativa)
CREATE POLICY "anon_view_scripts" ON public.scripts
  FOR SELECT TO anon USING (true);

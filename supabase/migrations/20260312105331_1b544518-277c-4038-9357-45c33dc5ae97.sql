
-- Allow anonymous users to view profiles (needed for author info in client portal)
CREATE POLICY "anon_view_profiles" ON public.profiles
  FOR SELECT TO anon USING (true);

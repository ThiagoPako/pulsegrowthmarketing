
-- Allow anon to read pending testimonials by token for validation
CREATE POLICY "anon_read_pending_by_token" ON public.client_testimonials
  FOR SELECT TO anon USING (status = 'pending');

-- Allow anon to update pending testimonials (submit feedback)
CREATE POLICY "anon_update_pending_testimonials" ON public.client_testimonials
  FOR UPDATE TO anon USING (status = 'pending') WITH CHECK (true);

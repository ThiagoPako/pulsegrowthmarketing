
-- Allow social_media role to manage endo contracts, packages and tasks
CREATE POLICY "social_media_manage_endo_contracts" ON public.client_endomarketing_contracts
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

CREATE POLICY "social_media_manage_endo_partner_tasks" ON public.endomarketing_partner_tasks
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

-- 1) Security definer view -> invoker
ALTER VIEW public.clients_public_logos SET (security_invoker = true);

-- 2) Public bucket listing: remove broad anon SELECT (public buckets still serve direct URLs)
DROP POLICY IF EXISTS "Anyone can view client logos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view design files" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public can view content files" ON storage.objects;

CREATE POLICY "Authenticated can list client logos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'client-logos');
CREATE POLICY "Authenticated can list design files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'design-files');
CREATE POLICY "Authenticated can list training videos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'training-videos');
CREATE POLICY "Authenticated can list content files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'client-content');

-- 3) Overly permissive anon policies
DROP POLICY IF EXISTS "Anon manage portal video views" ON public.portal_video_views;
CREATE POLICY "Anon can register portal video views" ON public.portal_video_views
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_manage_proposal_comments" ON public.proposal_comments;
CREATE POLICY "Anon can read proposal comments" ON public.proposal_comments
  FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can add proposal comments" ON public.proposal_comments
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can manage promotions" ON public.plan_promotions;
CREATE POLICY "Anyone can view promotions" ON public.plan_promotions
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated can manage promotions" ON public.plan_promotions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4) social_accounts: restrict management policies to authenticated only
DROP POLICY IF EXISTS "Admin manage social accounts" ON public.social_accounts;
DROP POLICY IF EXISTS "Social media manage social accounts" ON public.social_accounts;
CREATE POLICY "Admin manage social accounts" ON public.social_accounts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Social media manage social accounts" ON public.social_accounts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

-- 5) Lock down SECURITY DEFINER function execution
REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_role(app_role, text, text, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_client_by_login(text) FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trim_mural_desabafo() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM anon;
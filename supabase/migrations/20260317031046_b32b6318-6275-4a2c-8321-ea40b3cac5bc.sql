
-- ============================================================
-- SECURITY HARDENING MIGRATION
-- Fixes all critical and warning-level findings from audit
-- ============================================================

-- 1. CRITICAL: Remove plaintext client_password column
ALTER TABLE public.clients DROP COLUMN IF EXISTS client_password;

-- 2. CRITICAL: Fix social_accounts - change {public} to {authenticated}
DROP POLICY IF EXISTS "Authenticated can view social accounts" ON public.social_accounts;
CREATE POLICY "Authenticated can view social accounts" ON public.social_accounts
  FOR SELECT TO authenticated USING (true);

-- 3. CRITICAL: Remove anon policies from profiles
DROP POLICY IF EXISTS "anon_view_profiles" ON public.profiles;

-- 4. CRITICAL: Tighten clients anon policies - scope to onboarding only
DROP POLICY IF EXISTS "Public can view client for onboarding" ON public.clients;
DROP POLICY IF EXISTS "Anon can update client onboarding fields" ON public.clients;

-- 5. CRITICAL: Remove anon policies from scripts  
DROP POLICY IF EXISTS "anon_view_scripts" ON public.scripts;
DROP POLICY IF EXISTS "anon_update_scripts_priority" ON public.scripts;

-- 6. CRITICAL: Fix client_portal_notifications anon policies
DROP POLICY IF EXISTS "anon_view_portal_notifications" ON public.client_portal_notifications;
DROP POLICY IF EXISTS "anon_update_portal_notifications" ON public.client_portal_notifications;

-- 7. CRITICAL: Fix client_portal_contents anon policies
DROP POLICY IF EXISTS "anon_view_portal_contents" ON public.client_portal_contents;
DROP POLICY IF EXISTS "anon_update_portal_contents" ON public.client_portal_contents;

-- 8. CRITICAL: Fix onboarding_tasks anon policies
DROP POLICY IF EXISTS "Public can view onboarding tasks" ON public.onboarding_tasks;
DROP POLICY IF EXISTS "Public can update onboarding briefing" ON public.onboarding_tasks;

-- 9. CRITICAL: Fix client_portal_comments anon policies
DROP POLICY IF EXISTS "anon_view_portal_comments" ON public.client_portal_comments;
DROP POLICY IF EXISTS "anon_insert_portal_comments" ON public.client_portal_comments;

-- 10. WARNING: Fix integration_logs - change {public} to {authenticated}
DROP POLICY IF EXISTS "Authenticated can view integration logs" ON public.integration_logs;
DROP POLICY IF EXISTS "Authenticated can insert integration logs" ON public.integration_logs;
CREATE POLICY "Authenticated can view integration logs" ON public.integration_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert integration logs" ON public.integration_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- 11. WARNING: Restrict whatsapp_config to admin only
DROP POLICY IF EXISTS "Authenticated can view whatsapp config" ON public.whatsapp_config;
CREATE POLICY "Admin can view whatsapp config" ON public.whatsapp_config
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- 12. WARNING: Restrict payment_config to admin only
DROP POLICY IF EXISTS "Authenticated can view payment config" ON public.payment_config;
CREATE POLICY "Admin can view payment config" ON public.payment_config
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- 13. Create secure client portal access function for token-based access
CREATE OR REPLACE FUNCTION public.get_client_by_login(p_login text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clients WHERE client_login = p_login LIMIT 1;
$$;

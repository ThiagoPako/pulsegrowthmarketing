
DROP POLICY IF EXISTS "Authenticated can view clients" ON public.clients;
CREATE POLICY "Privileged roles view clients"
ON public.clients FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'social_media'::app_role));

CREATE OR REPLACE VIEW public.clients_safe
WITH (security_invoker = true) AS
SELECT id, company_name, responsible_person, city, status, plan_id, logo_url, color,
       client_type, niche, weekly_goal, created_at, updated_at
FROM public.clients;
GRANT SELECT ON public.clients_safe TO authenticated;

DROP POLICY IF EXISTS "Authenticated can view all profiles" ON public.profiles;
CREATE POLICY "Users view own profile or admin views all"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated can view social accounts" ON public.social_accounts;
CREATE POLICY "Privileged roles view social accounts"
ON public.social_accounts FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'social_media'::app_role));

DROP POLICY IF EXISTS anon_update_events ON public.client_events;

DROP POLICY IF EXISTS anon_read_pending_by_token ON public.client_testimonials;
DROP POLICY IF EXISTS anon_update_pending_testimonials ON public.client_testimonials;
CREATE POLICY "anon_read_pending_by_token"
ON public.client_testimonials FOR SELECT TO anon
USING (status = 'pending' AND token IS NOT NULL
       AND token = current_setting('request.headers', true)::json->>'x-testimonial-token');
CREATE POLICY "anon_update_pending_testimonials"
ON public.client_testimonials FOR UPDATE TO anon
USING (status = 'pending' AND token IS NOT NULL
       AND token = current_setting('request.headers', true)::json->>'x-testimonial-token')
WITH CHECK (status = 'submitted' AND token = current_setting('request.headers', true)::json->>'x-testimonial-token');

DROP POLICY IF EXISTS anon_view_proposal_by_token ON public.commercial_proposals;
DROP POLICY IF EXISTS anon_update_proposal_status ON public.commercial_proposals;
CREATE POLICY "anon_view_proposal_by_token"
ON public.commercial_proposals FOR SELECT TO anon
USING (token IS NOT NULL
       AND token = current_setting('request.headers', true)::json->>'x-proposal-token');
CREATE POLICY "anon_update_proposal_status"
ON public.commercial_proposals FOR UPDATE TO anon
USING (token IS NOT NULL
       AND token = current_setting('request.headers', true)::json->>'x-proposal-token'
       AND status = ANY (ARRAY['enviada','vista']))
WITH CHECK (token = current_setting('request.headers', true)::json->>'x-proposal-token'
            AND status = ANY (ARRAY['vista','aprovada','rejeitada']));

DROP POLICY IF EXISTS anon_update_claim_coupons ON public.discount_coupons;
CREATE POLICY "anon_update_claim_coupons"
ON public.discount_coupons FOR UPDATE TO anon
USING (status = 'available')
WITH CHECK (status = 'claimed');

DROP POLICY IF EXISTS "Public insert flyer items" ON public.flyer_items;
DROP POLICY IF EXISTS "Public update own flyer items" ON public.flyer_items;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig,'{}'::text[])) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', r.nspname, r.proname, r.args);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

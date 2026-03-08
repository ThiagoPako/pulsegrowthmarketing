
-- Fix RLS policies: change RESTRICTIVE to PERMISSIVE for all endo tables

-- client_endomarketing_contracts
DROP POLICY IF EXISTS "admin_manage_endo_contracts" ON public.client_endomarketing_contracts;
DROP POLICY IF EXISTS "auth_view_endo_contracts" ON public.client_endomarketing_contracts;
DROP POLICY IF EXISTS "endo_manage_endo_contracts" ON public.client_endomarketing_contracts;

CREATE POLICY "admin_manage_endo_contracts" ON public.client_endomarketing_contracts
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "auth_view_endo_contracts" ON public.client_endomarketing_contracts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "endo_manage_endo_contracts" ON public.client_endomarketing_contracts
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'endomarketing'::app_role))
  WITH CHECK (has_role(auth.uid(), 'endomarketing'::app_role));

-- endomarketing_packages
DROP POLICY IF EXISTS "admin_manage_endo_packages" ON public.endomarketing_packages;
DROP POLICY IF EXISTS "auth_view_endo_packages" ON public.endomarketing_packages;

CREATE POLICY "admin_manage_endo_packages" ON public.endomarketing_packages
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "auth_view_endo_packages" ON public.endomarketing_packages
  FOR SELECT TO authenticated USING (true);

-- endomarketing_partner_tasks
DROP POLICY IF EXISTS "admin_manage_endo_partner_tasks" ON public.endomarketing_partner_tasks;
DROP POLICY IF EXISTS "auth_view_endo_partner_tasks" ON public.endomarketing_partner_tasks;
DROP POLICY IF EXISTS "endo_manage_endo_partner_tasks" ON public.endomarketing_partner_tasks;
DROP POLICY IF EXISTS "partner_manage_own_endo_tasks" ON public.endomarketing_partner_tasks;

CREATE POLICY "admin_manage_endo_partner_tasks" ON public.endomarketing_partner_tasks
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "auth_view_endo_partner_tasks" ON public.endomarketing_partner_tasks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "endo_manage_endo_partner_tasks" ON public.endomarketing_partner_tasks
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'endomarketing'::app_role))
  WITH CHECK (has_role(auth.uid(), 'endomarketing'::app_role));

CREATE POLICY "partner_manage_own_endo_tasks" ON public.endomarketing_partner_tasks
  FOR ALL TO authenticated USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());

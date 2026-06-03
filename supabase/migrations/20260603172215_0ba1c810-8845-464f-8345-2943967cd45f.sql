
-- client_events: remove overly permissive anon UPDATE; restrict to status transitions only
DROP POLICY IF EXISTS anon_update_events ON public.client_events;
CREATE POLICY anon_update_events ON public.client_events
  FOR UPDATE TO anon
  USING (status = 'ativo')
  WITH CHECK (status IN ('ativo','encerrado','cancelado'));

-- client_testimonials: tighten anon update so they can only submit a pending one
DROP POLICY IF EXISTS anon_update_pending_testimonials ON public.client_testimonials;
CREATE POLICY anon_update_pending_testimonials ON public.client_testimonials
  FOR UPDATE TO anon
  USING (status = 'pending')
  WITH CHECK (status = 'submitted');

-- commercial_proposals: restrict anon update to status transitions
DROP POLICY IF EXISTS anon_update_proposal_status ON public.commercial_proposals;
CREATE POLICY anon_update_proposal_status ON public.commercial_proposals
  FOR UPDATE TO anon
  USING (status IN ('enviada','vista'))
  WITH CHECK (status IN ('vista','aprovada','rejeitada'));

-- commercial_proposals: only admin/social_media authenticated can view (drop generic auth_view)
DROP POLICY IF EXISTS auth_view_proposals ON public.commercial_proposals;
DROP POLICY IF EXISTS auth_insert_proposals ON public.commercial_proposals;
CREATE POLICY commercial_view_proposals ON public.commercial_proposals
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'social_media'));

-- proposal_checklist_items: drop anon write capability (admin/social only)
DROP POLICY IF EXISTS "Anon update proposal checklist" ON public.proposal_checklist_items;
DROP POLICY IF EXISTS "Anon view proposal checklist by client" ON public.proposal_checklist_items;
DROP POLICY IF EXISTS "Authenticated view proposal checklist" ON public.proposal_checklist_items;
DROP POLICY IF EXISTS "Allow authenticated insert proposal checklist" ON public.proposal_checklist_items;
CREATE POLICY checklist_view_team ON public.proposal_checklist_items
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'social_media'));

-- discount_coupons: tighten with_check so anon can only mark as claimed
DROP POLICY IF EXISTS anon_update_claim_coupons ON public.discount_coupons;
CREATE POLICY anon_update_claim_coupons ON public.discount_coupons
  FOR UPDATE TO anon
  USING (status = 'available')
  WITH CHECK (status = 'claimed');

-- discount_coupons: restrict authenticated SELECT to admin/social_media
DROP POLICY IF EXISTS auth_view_discount_coupons ON public.discount_coupons;
CREATE POLICY coupons_view_team ON public.discount_coupons
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'social_media'));

-- client_events: restrict generic auth_view to admin/social_media
DROP POLICY IF EXISTS auth_view_events ON public.client_events;
CREATE POLICY events_view_team ON public.client_events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'social_media'));

CREATE POLICY "Allow authenticated insert proposal checklist"
ON public.proposal_checklist_items
FOR INSERT TO authenticated
WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can manage promotions" ON public.plan_promotions;
CREATE POLICY "Anyone can manage promotions" ON public.plan_promotions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_promotions TO anon, authenticated;
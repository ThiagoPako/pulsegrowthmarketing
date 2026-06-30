DROP POLICY IF EXISTS "Public can view active promotions" ON public.plan_promotions;
CREATE POLICY "Public can view active promotions"
ON public.plan_promotions
FOR SELECT
TO anon, authenticated
USING (active = true);
GRANT SELECT ON public.plan_promotions TO anon, authenticated;
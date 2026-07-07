ALTER TABLE public.plan_promotions ADD COLUMN IF NOT EXISTS exclusive boolean NOT NULL DEFAULT false;
-- Policy pública: quando exclusive=true, só aparece se a query filtrar por id explícito
DROP POLICY IF EXISTS "Public can view active promotions" ON public.plan_promotions;
CREATE POLICY "Public can view promotions" ON public.plan_promotions
  FOR SELECT TO anon, authenticated
  USING (active = true OR exclusive = true);
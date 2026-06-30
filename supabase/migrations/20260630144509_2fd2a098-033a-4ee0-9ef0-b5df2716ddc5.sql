
CREATE TABLE public.plan_promotions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city TEXT,
  plan_key TEXT,
  applies_to TEXT NOT NULL DEFAULT 'anual' CHECK (applies_to IN ('anual','semestral','ambos')),
  title TEXT NOT NULL,
  description TEXT,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  duration_months INTEGER NOT NULL DEFAULT 6,
  active BOOLEAN NOT NULL DEFAULT true,
  starts_at DATE,
  ends_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plan_promotions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_promotions TO authenticated;
GRANT ALL ON public.plan_promotions TO service_role;

ALTER TABLE public.plan_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active promotions"
ON public.plan_promotions FOR SELECT
USING (active = true);

CREATE POLICY "Authenticated can manage promotions"
ON public.plan_promotions FOR ALL
TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER update_plan_promotions_updated_at
BEFORE UPDATE ON public.plan_promotions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

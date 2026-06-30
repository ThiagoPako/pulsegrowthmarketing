ALTER TABLE public.plan_promotions
  ADD COLUMN IF NOT EXISTS max_redemptions integer,
  ADD COLUMN IF NOT EXISTS redemptions_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_promotion_redemption(_promo_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE public.plan_promotions
  SET redemptions_count = redemptions_count + 1
  WHERE id = _promo_id
    AND (max_redemptions IS NULL OR redemptions_count < max_redemptions)
  RETURNING redemptions_count INTO new_count;
  RETURN new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_promotion_redemption(uuid) TO authenticated, anon;
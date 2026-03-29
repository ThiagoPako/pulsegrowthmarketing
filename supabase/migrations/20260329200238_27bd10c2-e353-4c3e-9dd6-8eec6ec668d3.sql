
-- Discount campaigns per client
CREATE TABLE public.discount_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  discount_type text NOT NULL DEFAULT 'percentage',
  discount_value numeric NOT NULL DEFAULT 0,
  min_purchase_value numeric DEFAULT 0,
  total_coupons integer NOT NULL DEFAULT 10,
  coupons_claimed integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

CREATE TABLE public.discount_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.discount_campaigns(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'available',
  claimed_by_name text,
  claimed_by_phone text,
  claimed_at timestamp with time zone,
  used_at timestamp with time zone,
  sale_value numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.discount_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_discount_campaigns" ON public.discount_campaigns FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "social_media_manage_discount_campaigns" ON public.discount_campaigns FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

CREATE POLICY "auth_view_discount_campaigns" ON public.discount_campaigns FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "anon_view_active_discount_campaigns" ON public.discount_campaigns FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY "admin_manage_discount_coupons" ON public.discount_coupons FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "social_media_manage_discount_coupons" ON public.discount_coupons FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

CREATE POLICY "auth_view_discount_coupons" ON public.discount_coupons FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "anon_view_available_coupons" ON public.discount_coupons FOR SELECT TO anon
  USING (status = 'available');

CREATE POLICY "anon_update_claim_coupons" ON public.discount_coupons FOR UPDATE TO anon
  USING (status = 'available')
  WITH CHECK (true);

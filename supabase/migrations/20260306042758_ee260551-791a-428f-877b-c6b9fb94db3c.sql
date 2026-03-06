
-- Add 'parceiro' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'parceiro';

-- Create partners table for extra partner info
CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text,
  service_function text NOT NULL DEFAULT '',
  fixed_rate numeric NOT NULL DEFAULT 0,
  phone text DEFAULT '',
  notes text DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage partners" ON public.partners FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view partners" ON public.partners FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Partner can view own record" ON public.partners FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Add partner fields to plans table
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS partner_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_partner_plan boolean NOT NULL DEFAULT false;

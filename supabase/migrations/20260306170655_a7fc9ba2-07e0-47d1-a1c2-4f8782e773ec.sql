
-- Add email and city to clients
ALTER TABLE public.clients 
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '';

-- Create social_accounts table
CREATE TABLE public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL DEFAULT 'instagram',
  facebook_page_id text,
  instagram_business_id text,
  account_name text NOT NULL DEFAULT '',
  access_token text NOT NULL DEFAULT '',
  token_expiration timestamp with time zone,
  status text NOT NULL DEFAULT 'connected',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage social accounts" ON public.social_accounts FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Social media manage social accounts" ON public.social_accounts FOR ALL USING (has_role(auth.uid(), 'social_media'::app_role)) WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));
CREATE POLICY "Authenticated can view social accounts" ON public.social_accounts FOR SELECT USING (true);

-- Create integration_logs table
CREATE TABLE public.integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'success',
  message text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage integration logs" ON public.integration_logs FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view integration logs" ON public.integration_logs FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert integration logs" ON public.integration_logs FOR INSERT WITH CHECK (true);

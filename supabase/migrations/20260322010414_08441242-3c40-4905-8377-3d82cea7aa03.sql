
CREATE VIEW public.clients_public_logos
WITH (security_invoker = false) AS
  SELECT id, company_name, logo_url, color
  FROM public.clients
  WHERE logo_url IS NOT NULL AND logo_url != '';

GRANT SELECT ON public.clients_public_logos TO anon;
GRANT SELECT ON public.clients_public_logos TO authenticated;

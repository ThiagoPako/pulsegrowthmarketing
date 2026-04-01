
CREATE TABLE public.login_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  user_role TEXT NOT NULL DEFAULT '',
  logged_in_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view all login logs"
  ON public.login_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can insert login logs"
  ON public.login_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anon can insert login logs"
  ON public.login_logs FOR INSERT
  TO anon
  WITH CHECK (true);

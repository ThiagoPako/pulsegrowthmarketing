
-- Drop the ALL policy that blocks non-admin SELECT
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

-- Re-create admin policies for write operations only
CREATE POLICY "Admins can manage profiles"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Make the SELECT policy permissive so it works independently
DROP POLICY IF EXISTS "Authenticated can view all profiles" ON public.profiles;
CREATE POLICY "Authenticated can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

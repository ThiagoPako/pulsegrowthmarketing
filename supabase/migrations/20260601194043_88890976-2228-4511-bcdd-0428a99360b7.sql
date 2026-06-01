-- 1. Permissões para training_tracks
ALTER TABLE public.training_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins have full access to tracks" ON public.training_tracks;
CREATE POLICY "Admins have full access to tracks" 
ON public.training_tracks 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Everyone can view active tracks" ON public.training_tracks;
CREATE POLICY "Everyone can view active tracks" 
ON public.training_tracks 
FOR SELECT 
TO authenticated 
USING (is_active = true);

-- 2. Permissões para training_modules
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins have full access to modules" ON public.training_modules;
CREATE POLICY "Admins have full access to modules" 
ON public.training_modules 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Everyone can view modules" ON public.training_modules;
CREATE POLICY "Everyone can view modules" 
ON public.training_modules 
FOR SELECT 
TO authenticated 
USING (true);

-- 3. Permissões para training_lessons
ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins have full access to lessons" ON public.training_lessons;
CREATE POLICY "Admins have full access to lessons" 
ON public.training_lessons 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Everyone can view lessons" ON public.training_lessons;
CREATE POLICY "Everyone can view lessons" 
ON public.training_lessons 
FOR SELECT 
TO authenticated 
USING (true);

-- 4. Garantir privilégios básicos para as roles
GRANT ALL ON public.training_tracks TO authenticated;
GRANT ALL ON public.training_modules TO authenticated;
GRANT ALL ON public.training_lessons TO authenticated;
GRANT ALL ON public.training_tracks TO service_role;
GRANT ALL ON public.training_modules TO service_role;
GRANT ALL ON public.training_lessons TO service_role;

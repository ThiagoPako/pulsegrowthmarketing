CREATE POLICY "Videomaker can update scripts recorded status"
ON public.scripts
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'videomaker'::app_role))
WITH CHECK (has_role(auth.uid(), 'videomaker'::app_role));
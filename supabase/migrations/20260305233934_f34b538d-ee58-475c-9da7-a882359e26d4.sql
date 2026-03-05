CREATE POLICY "Videomaker can update content tasks"
ON public.content_tasks
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'videomaker'::app_role))
WITH CHECK (has_role(auth.uid(), 'videomaker'::app_role));
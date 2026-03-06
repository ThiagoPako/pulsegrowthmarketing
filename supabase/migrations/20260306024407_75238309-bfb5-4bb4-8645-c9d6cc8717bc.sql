CREATE POLICY "Editor can insert social deliveries"
ON public.social_media_deliveries
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'editor'::app_role));

CREATE POLICY "Editor can update social deliveries"
ON public.social_media_deliveries
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'editor'::app_role))
WITH CHECK (has_role(auth.uid(), 'editor'::app_role));
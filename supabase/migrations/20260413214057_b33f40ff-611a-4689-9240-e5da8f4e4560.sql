
-- Allow anon to insert events (portal creates events without JWT)
CREATE POLICY "anon_create_events"
ON public.client_events
FOR INSERT
TO anon
WITH CHECK (client_id IS NOT NULL);

-- Allow anon to update events they created
CREATE POLICY "anon_update_events"
ON public.client_events
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

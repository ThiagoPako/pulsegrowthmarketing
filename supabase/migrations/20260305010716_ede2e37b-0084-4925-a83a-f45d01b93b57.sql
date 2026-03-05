
-- Add logo_url column to clients
ALTER TABLE public.clients ADD COLUMN logo_url text DEFAULT NULL;

-- Create storage bucket for client logos
INSERT INTO storage.buckets (id, name, public) VALUES ('client-logos', 'client-logos', true);

-- Allow authenticated users to upload logos
CREATE POLICY "Authenticated can upload client logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'client-logos');

-- Allow anyone to view logos (public bucket)
CREATE POLICY "Anyone can view client logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-logos');

-- Allow authenticated to update/delete logos
CREATE POLICY "Authenticated can update client logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'client-logos');

CREATE POLICY "Authenticated can delete client logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'client-logos');

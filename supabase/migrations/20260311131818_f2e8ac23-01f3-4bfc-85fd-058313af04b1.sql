
-- Add drive_fotos_ensaio column to onboarding_tasks for photo shoot drive link
ALTER TABLE public.onboarding_tasks
ADD COLUMN IF NOT EXISTS drive_link text DEFAULT NULL;

-- Create storage bucket for onboarding contracts
INSERT INTO storage.buckets (id, name, public) VALUES ('onboarding-contracts', 'onboarding-contracts', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for onboarding-contracts bucket
CREATE POLICY "Authenticated users can upload contracts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'onboarding-contracts');

CREATE POLICY "Authenticated users can view contracts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'onboarding-contracts');

CREATE POLICY "Admin can delete contracts"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'onboarding-contracts' AND (SELECT has_role(auth.uid(), 'admin')));

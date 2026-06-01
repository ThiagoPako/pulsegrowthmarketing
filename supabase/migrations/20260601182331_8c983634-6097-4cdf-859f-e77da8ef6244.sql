-- Create storage bucket for training videos if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('training-videos', 'training-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for training-videos bucket
-- Allow public read access
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'training-videos');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'training-videos');

-- Allow authenticated users to update their uploads (optional, but good for replacement)
CREATE POLICY "Authenticated users can update" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (bucket_id = 'training-videos');

-- Allow authenticated users to delete (optional)
CREATE POLICY "Authenticated users can delete" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id = 'training-videos');

-- Add video_path column to training_lessons if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'training_lessons' AND column_name = 'video_path') THEN
    ALTER TABLE public.training_lessons ADD COLUMN video_path TEXT;
  END IF;
END $$;

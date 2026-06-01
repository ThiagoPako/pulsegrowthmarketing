-- Add more details to tracks
ALTER TABLE public.training_tracks 
ADD COLUMN IF NOT EXISTS estimated_time TEXT,
ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'Iniciante';

-- Add more details to lessons (for markdown content and instructions)
ALTER TABLE public.training_lessons 
ADD COLUMN IF NOT EXISTS content_markdown TEXT,
ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT false;

-- Add a bio/profile field to profiles if not exists (for instructors later)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS training_bio TEXT;

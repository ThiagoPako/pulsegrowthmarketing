-- Create training tracks table
CREATE TABLE IF NOT EXISTS public.training_tracks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    category TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create training modules table
CREATE TABLE IF NOT EXISTS public.training_modules (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    track_id UUID REFERENCES public.training_tracks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create training lessons (the "slots") table
CREATE TABLE IF NOT EXISTS public.training_lessons (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    module_id UUID REFERENCES public.training_modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    video_url TEXT,
    thumbnail_url TEXT,
    duration TEXT,
    methodology_name TEXT, -- The name of the technique (e.g., "Caminhada Dinâmica")
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create training progress table
CREATE TABLE IF NOT EXISTS public.user_training_progress (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES public.training_lessons(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, lesson_id)
);

-- Grant permissions
GRANT SELECT ON public.training_tracks TO authenticated;
GRANT SELECT ON public.training_modules TO authenticated;
GRANT SELECT ON public.training_lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_training_progress TO authenticated;

GRANT ALL ON public.training_tracks TO service_role;
GRANT ALL ON public.training_modules TO service_role;
GRANT ALL ON public.training_lessons TO service_role;
GRANT ALL ON public.user_training_progress TO service_role;

-- Grant ALL to authenticated for management (limited by RLS)
GRANT ALL ON public.training_tracks TO authenticated;
GRANT ALL ON public.training_modules TO authenticated;
GRANT ALL ON public.training_lessons TO authenticated;

-- Enable RLS
ALTER TABLE public.training_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_training_progress ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view active tracks" ON public.training_tracks FOR SELECT USING (true);
CREATE POLICY "Anyone can view modules" ON public.training_modules FOR SELECT USING (true);
CREATE POLICY "Anyone can view lessons" ON public.training_lessons FOR SELECT USING (true);
CREATE POLICY "Users can view their own progress" ON public.user_training_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own progress" ON public.user_training_progress FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admin policies (assuming role check in app or via another table, but for now we'll rely on app-level role check or simplified RLS)
-- Ideally we check role from profiles table.
CREATE POLICY "Admins can manage tracks" ON public.training_tracks 
FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can manage modules" ON public.training_modules 
FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can manage lessons" ON public.training_lessons 
FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_training_tracks_updated_at BEFORE UPDATE ON public.training_tracks FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_training_modules_updated_at BEFORE UPDATE ON public.training_modules FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_training_lessons_updated_at BEFORE UPDATE ON public.training_lessons FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

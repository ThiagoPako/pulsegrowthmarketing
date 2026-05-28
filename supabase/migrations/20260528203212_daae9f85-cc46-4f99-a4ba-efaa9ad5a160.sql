CREATE TABLE public.manual_video_tasks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    videomaker_id UUID REFERENCES auth.users NOT NULL,
    client_id UUID REFERENCES public.profiles(id),
    prospect_name TEXT,
    title TEXT NOT NULL,
    script TEXT,
    material_link TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_video_tasks TO authenticated;
GRANT ALL ON public.manual_video_tasks TO service_role;

ALTER TABLE public.manual_video_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Videomakers can view their manual tasks" 
ON public.manual_video_tasks FOR SELECT 
USING (auth.uid() = videomaker_id);

CREATE POLICY "Videomakers can insert their manual tasks" 
ON public.manual_video_tasks FOR INSERT 
WITH CHECK (auth.uid() = videomaker_id);

CREATE POLICY "Videomakers can update their manual tasks" 
ON public.manual_video_tasks FOR UPDATE 
USING (auth.uid() = videomaker_id);

CREATE POLICY "Videomakers can delete their manual tasks" 
ON public.manual_video_tasks FOR DELETE 
USING (auth.uid() = videomaker_id);

CREATE TRIGGER update_manual_video_tasks_updated_at
BEFORE UPDATE ON public.manual_video_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.mural_desabafo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.mural_desabafo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read mural" ON public.mural_desabafo
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can post" ON public.mural_desabafo
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can delete own posts" ON public.mural_desabafo
  FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- Keep only last 50 messages via trigger
CREATE OR REPLACE FUNCTION public.trim_mural_desabafo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.mural_desabafo
  WHERE id NOT IN (
    SELECT id FROM public.mural_desabafo ORDER BY created_at DESC LIMIT 50
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trim_mural_after_insert
  AFTER INSERT ON public.mural_desabafo
  FOR EACH STATEMENT EXECUTE FUNCTION public.trim_mural_desabafo();

ALTER TABLE public.user_training_progress 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'not_started';

-- Garantir que a coluna 'duration' em training_lessons tenha um padrão caso falte
ALTER TABLE public.training_lessons 
ALTER COLUMN duration SET DEFAULT '10s';

-- Adicionar coluna 'is_active' em training_tracks caso não exista (já existe mas por segurança)
ALTER TABLE public.training_tracks 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

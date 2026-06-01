-- 1. ESTRUTURA DE TABELAS (GARANTIR COLUNAS)
ALTER TABLE IF EXISTS public.training_tracks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE IF EXISTS public.training_tracks ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE IF EXISTS public.training_tracks ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE IF EXISTS public.training_modules ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE IF EXISTS public.training_modules ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

ALTER TABLE IF EXISTS public.training_lessons ADD COLUMN IF NOT EXISTS methodology_name TEXT;
ALTER TABLE IF EXISTS public.training_lessons ADD COLUMN IF NOT EXISTS duration TEXT DEFAULT '10s';
ALTER TABLE IF EXISTS public.training_lessons ADD COLUMN IF NOT EXISTS content_markdown TEXT;
ALTER TABLE IF EXISTS public.training_lessons ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE IF EXISTS public.training_lessons ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE IF EXISTS public.training_lessons ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- 2. LIMPAR DADOS CONFLITANTES
DELETE FROM public.user_training_progress;
DELETE FROM public.training_lessons;
DELETE FROM public.training_modules;
DELETE FROM public.training_tracks;

-- 3. POPULAR METODOLOGIA PULSE (UUIDS REAIS)
INSERT INTO public.training_tracks (id, title, description, category, difficulty, estimated_time, is_active, thumbnail_url) 
VALUES ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Metodologia de Captação Pulse', 'Aprenda o método exclusivo Pulse para gravar vídeos de alta qualidade com velocidade e eficiência.', 'Metodologia', 'Intermediário', '1h 30min', true, 'https://images.unsplash.com/photo-1492691523567-6170f2295b21?auto=format&fit=crop&q=80&w=2070');

INSERT INTO public.training_modules (id, track_id, title, description, display_order) VALUES
('550e8400-e29b-41d4-a716-446655440010', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Módulo 1: Fundamentos e Mentalidade', 'A base para gravar rápido e com qualidade.', 0),
('550e8400-e29b-41d4-a716-446655440020', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Módulo 2: Gravação de Falas e Performance', 'Como portar-se e dirigir o talento em frente à câmera.', 1),
('550e8400-e29b-41d4-a716-446655440030', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Módulo 3: Takes de Produto e B-Roll', 'Estética e dinamismo para cenas de apoio.', 2),
('550e8400-e29b-41d4-a716-446655440040', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Módulo 4: Agilidade no Set e Entrega', 'Checklists e processos para não perder tempo.', 3);

INSERT INTO public.training_lessons (module_id, title, methodology_name, duration, display_order, thumbnail_url) VALUES
('550e8400-e29b-41d4-a716-446655440010', 'O DNA Pulse: Rápido e Bem Feito', 'Cultura Pulse', '3 min', 0, 'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&q=80&w=600'),
('550e8400-e29b-41d4-a716-446655440010', 'Equipamento e Configurações Rápidas', 'Fast Setup', '5 min', 1, 'https://images.unsplash.com/photo-1492724441997-5dc865305da7?auto=format&fit=crop&q=80&w=600'),
('550e8400-e29b-41d4-a716-446655440020', 'Caminhada Dinâmica (Talk & Walk)', 'Caminhada Dinâmica', '10s', 0, 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=600'),
('550e8400-e29b-41d4-a716-446655440020', 'Gesticulação Ativa e Olhar', 'Performance', '10s', 1, 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&q=80&w=600'),
('550e8400-e29b-41d4-a716-446655440030', 'A Regra de Ouro (5-10s)', 'Timing Pulse', '5s', 0, 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=600'),
('550e8400-e29b-41d4-a716-446655440030', 'Cenas de Detalhe (Macro Flow)', 'Product Detail', '10s', 1, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=600'),
('550e8400-e29b-41d4-a716-446655440040', 'Checklist de Saída e Backup', 'Safe Delivery', '5 min', 0, 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&q=80&w=600');

-- 4. PERMISSÕES RLS (RESET TOTAL)
ALTER TABLE public.training_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_training_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access to tracks" ON public.training_tracks;
CREATE POLICY "Public access to tracks" ON public.training_tracks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin full access tracks" ON public.training_tracks FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Public access to modules" ON public.training_modules;
CREATE POLICY "Public access to modules" ON public.training_modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin full access modules" ON public.training_modules FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Public access to lessons" ON public.training_lessons;
CREATE POLICY "Public access to lessons" ON public.training_lessons FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin full access lessons" ON public.training_lessons FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 5. GRANT PARA USUÁRIO VPS (SUBSTITUIR SE NECESSÁRIO)
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;

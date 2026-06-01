-- 1. LIMPAR TUDO
DELETE FROM public.user_training_progress;
DELETE FROM public.training_lessons;
DELETE FROM public.training_modules;
DELETE FROM public.training_tracks;

-- 2. CRIAR TRILHA ELITE
INSERT INTO public.training_tracks (id, title, description, category, difficulty, estimated_time, is_active, thumbnail_url) 
VALUES ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Metodologia de Captação Pulse', 'Aprenda o método exclusivo Pulse para gravar vídeos de alta qualidade com velocidade e eficiência.', 'Metodologia', 'Iniciante', '1h 30min', true, 'https://images.unsplash.com/photo-1492691523567-6170f2295b21?auto=format&fit=crop&q=80&w=2070');

-- 3. CRIAR MÓDULOS COM UUIDs VÁLIDOS
INSERT INTO public.training_modules (id, track_id, title, display_order) VALUES
('550e8400-e29b-41d4-a716-446655440010', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Módulo 1: Fundamentos e Mentalidade', 0),
('550e8400-e29b-41d4-a716-446655440020', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Módulo 2: Gravação de Falas e Performance', 1),
('550e8400-e29b-41d4-a716-446655440030', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Módulo 3: Takes de Produto e B-Roll', 2),
('550e8400-e29b-41d4-a716-446655440040', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Módulo 4: Agilidade no Set e Entrega', 3);

-- 4. CRIAR SLOTS COM IMAGENS COMPATÍVEIS
INSERT INTO public.training_lessons (module_id, title, methodology_name, duration, display_order, thumbnail_url, video_url) VALUES
-- Módulo 1
('550e8400-e29b-41d4-a716-446655440010', 'O DNA Pulse: Rápido e Bem Feito', 'Cultura Pulse', '3 min', 0, 'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&q=80&w=600', NULL),
('550e8400-e29b-41d4-a716-446655440010', 'Equipamento e Configurações Rápidas', 'Fast Setup', '5 min', 1, 'https://images.unsplash.com/photo-1492724441997-5dc865305da7?auto=format&fit=crop&q=80&w=600', NULL),
-- Módulo 2
('550e8400-e29b-41d4-a716-446655440020', 'Caminhada Dinâmica (Talk & Walk)', 'Caminhada Dinâmica', '10s', 0, 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=600', NULL),
('550e8400-e29b-41d4-a716-446655440020', 'Gesticulação Ativa e Olhar', 'Performance', '10s', 1, 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&q=80&w=600', NULL),
-- Módulo 3
('550e8400-e29b-41d4-a716-446655440030', 'A Regra de Ouro (5-10s)', 'Timing Pulse', '5s', 0, 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=600', NULL),
('550e8400-e29b-41d4-a716-446655440030', 'Cenas de Detalhe (Macro Flow)', 'Product Detail', '10s', 1, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=600', NULL),
-- Módulo 4
('550e8400-e29b-41d4-a716-446655440040', 'Checklist de Saída e Backup', 'Safe Delivery', '5 min', 0, 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&q=80&w=600', NULL);

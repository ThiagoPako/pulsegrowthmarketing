-- 1. Insert the main Track
INSERT INTO public.training_tracks (id, title, description, category, estimated_time, difficulty, thumbnail_url)
VALUES (
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 
    'Metodologia de Captação Pulse', 
    'Aprenda o método exclusivo Pulse para gravar vídeos de alta qualidade com velocidade e eficiência.', 
    'Metodologia', 
    '1h 30min', 
    'Iniciante',
    'https://images.unsplash.com/photo-1492691523567-6170f2295b21?auto=format&fit=crop&q=80&w=2070'
) ON CONFLICT (id) DO NOTHING;

-- 2. Insert Modules
INSERT INTO public.training_modules (id, track_id, title, description, display_order)
VALUES 
(
    'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e', 
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 
    'Módulo 1: Gravação de Falas', 
    'Técnicas para gravar apresentações e falas impactantes.', 
    0
),
(
    'c3d4e5f6-a7b8-4c6d-0e1f-2a3b4c5d6e7f', 
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 
    'Módulo 2: Takes de Produtos', 
    'Como capturar a essência dos produtos em takes curtos.', 
    1
) ON CONFLICT (id) DO NOTHING;

-- 3. Insert Lessons (Slots)
INSERT INTO public.training_lessons (module_id, title, description, methodology_name, duration, display_order, video_url, content_markdown)
VALUES 
-- Module 1
(
    'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e', 
    'Introdução à Metodologia', 
    'Entenda por que gravamos rápido e bem feito.', 
    'Visão Geral', 
    '2 min', 
    0, 
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
    '### O que você vai aprender\n- Mentalidade Pulse de produção.\n- Como se preparar para o set.\n- Equipamentos básicos.'
),
(
    'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e', 
    'Caminhada Dinâmica', 
    'Gravando andando em direção à câmera e gesticulando com as mãos.', 
    'Dynamic Entry', 
    '10s', 
    1, 
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
    '### Técnica: Caminhada Dinâmica\n\nEste modo é essencial para gerar autoridade e movimento.\n\n**Como executar:**\n1. Mantenha o contato visual com a lente.\n2. Use as mãos para enfatizar pontos-chave.\n3. Caminhe de forma confiante, sem pressa.'
),
-- Module 2
(
    'c3d4e5f6-a7b8-4c6d-0e1f-2a3b4c5d6e7f', 
    'A Regra dos 5-10 Segundos', 
    'Por que usamos takes curtos para produtos.', 
    'Timing Pulse', 
    '5s', 
    0, 
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
    '### Por que 5-10 segundos?\nTakes curtos mantêm a atenção do espectador e facilitam a edição dinâmica (reels/tiktok).'
),
(
    'c3d4e5f6-a7b8-4c6d-0e1f-2a3b4c5d6e7f', 
    'Cenas de Detalhe de Produto', 
    'Idéias de como fazer cenas dos produtos.', 
    'Macro Shot', 
    '10s', 
    1, 
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
    '### Dicas de Ouro:\n- Use luz lateral para realçar texturas.\n- Faça movimentos de camera lentos (pan/tilt).\n- Foque no benefício visual do produto.'
) ON CONFLICT DO NOTHING;

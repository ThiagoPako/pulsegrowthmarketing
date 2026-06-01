-- Ensure the modules and slots are precisely named as per the methodology
-- First, clear existing to avoid duplicates if re-running, or just update

-- Module 1: Gravação de Falas
UPDATE public.training_modules 
SET title = 'Módulo 1: Gravação de Falas', 
    description = 'Dominando a comunicação em movimento e autoridade em frente às câmeras.'
WHERE id = 'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e';

-- Module 2: Takes de Produtos
UPDATE public.training_modules 
SET title = 'Módulo 2: Takes de Produtos', 
    description = 'Capturando detalhes e mantendo o dinamismo na vitrine de produtos.'
WHERE id = 'c3d4e5f6-a7b8-4c6d-0e1f-2a3b4c5d6e7f';

-- Insert or Update specific slots for Module 1
INSERT INTO public.training_lessons (module_id, title, description, methodology_name, duration, display_order, video_url, content_markdown)
VALUES 
(
    'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e', 
    'Abertura e Boas-Vindas', 
    'Vídeo de introdução apresentando a cultura Pulse de gravação.', 
    'Intro Academy', 
    '2 min', 
    0, 
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
    '### Bem-vindo ao Pulse Academy\nAssista este vídeo antes de começar as aulas técnicas.'
),
(
    'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e', 
    'Caminhada Dinâmica (Talk & Walk)', 
    'Como gravar andando em direção à câmera gesticulando com as mãos de forma natural.', 
    'Caminhada Dinâmica', 
    '10s', 
    1, 
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
    '### Técnica: Caminhada Dinâmica\n\n**O que é:** Gravar o apresentador vindo em direção à lente.\n\n**Objetivo:** Gerar proximidade e autoridade.\n\n**Checklist:**\n- Braços soltos.\n- Gesticulação na altura do peito.\n- Passo firme mas constante.'
)
ON CONFLICT DO NOTHING;

-- Insert or Update specific slots for Module 2
INSERT INTO public.training_lessons (module_id, title, description, methodology_name, duration, display_order, video_url, content_markdown)
VALUES 
(
    'c3d4e5f6-a7b8-4c6d-0e1f-2a3b4c5d6e7f', 
    'A Regra de Ouro: 5 a 10 Segundos', 
    'Por que cada take deve durar exatamente este tempo para nossa edição.', 
    'Timing Pulse', 
    '5s', 
    0, 
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
    '### O Padrão 5-10s\nNossos editores precisam de material dinâmico. Nunca passe de 10 segundos por take de produto.'
),
(
    'c3d4e5f6-a7b8-4c6d-0e1f-2a3b4c5d6e7f', 
    'Exemplo: Cenas de Detalhe de Produto', 
    'Como fazer cenas de produtos com movimento e foco em detalhes.', 
    'Product Detail Flow', 
    '10s', 
    1, 
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
    '### Como gravar produtos:\n1. Mostre o logo.\n2. Mostre o uso.\n3. Faça um movimento de deslize (Slide).'
)
ON CONFLICT DO NOTHING;

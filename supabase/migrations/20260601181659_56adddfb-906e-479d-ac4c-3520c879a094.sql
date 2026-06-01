-- 1. Inserir Módulos com UUIDs válidos
INSERT INTO public.training_modules (id, track_id, title, description, display_order)
VALUES 
(gen_random_uuid(), 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Módulo 1: Fundamentos e Mentalidade', 'A base para gravar rápido e com qualidade.', 0),
(gen_random_uuid(), 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Módulo 2: Gravação de Falas e Performance', 'Como portar-se e dirigir o talento em frente à câmera.', 1),
(gen_random_uuid(), 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Módulo 3: Takes de Produto e B-Roll', 'Estética e dinamismo para cenas de apoio.', 2),
(gen_random_uuid(), 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Módulo 4: Agilidade no Set e Entrega', 'Checklists e processos para não perder tempo.', 3)
ON CONFLICT DO NOTHING;

-- 2. Inserir Slots de Aulas (Lessons) vinculados aos módulos corretos
-- Usaremos subqueries para encontrar os IDs dos módulos recém-criados

-- Aulas do Módulo 1
INSERT INTO public.training_lessons (module_id, title, description, methodology_name, duration, display_order, video_url, content_markdown)
SELECT id, 'O DNA Pulse: Rápido e Bem Feito', 'Por que a velocidade é nossa maior aliada.', 'Cultura Pulse', '3 min', 0, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', '### Mentalidade Pulse\n- Qualidade não é negociável.\n- Tempo é dinheiro para o cliente.\n- Otimização de processos.'
FROM public.training_modules WHERE title = 'Módulo 1: Fundamentos e Mentalidade' LIMIT 1;

INSERT INTO public.training_lessons (module_id, title, description, methodology_name, duration, display_order, video_url, content_markdown)
SELECT id, 'Equipamento e Configurações Rápidas', 'O que levar e como configurar em 2 minutos.', 'Fast Setup', '5 min', 1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', '### Configurações de Câmera\n- Resolução: 4K.\n- FPS: 24 ou 60 para slow.\n- Obturador: 1/50 ou 1/120.'
FROM public.training_modules WHERE title = 'Módulo 1: Fundamentos e Mentalidade' LIMIT 1;

-- Aulas do Módulo 2
INSERT INTO public.training_lessons (module_id, title, description, methodology_name, duration, display_order, video_url, content_markdown)
SELECT id, 'Caminhada Dinâmica (Talk & Walk)', 'Gravando enquanto caminha para gerar dinamismo.', 'Talk & Walk', '10s', 0, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', '### Técnica: Caminhada Dinâmica\n- Câmera recuando.\n- Apresentador vindo em direção à lente.\n- Gesticulação natural acima da cintura.'
FROM public.training_modules WHERE title = 'Módulo 2: Gravação de Falas e Performance' LIMIT 1;

INSERT INTO public.training_lessons (module_id, title, description, methodology_name, duration, display_order, video_url, content_markdown)
SELECT id, 'Gesticulação Ativa e Olhar', 'Como usar as mãos para pontuar falas importantes.', 'Active Hands', '8s', 1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', '### Dicas de Performance\n- Nunca esconda as mãos.\n- Olhar fixo na lente, não na tela.\n- Sorriso no início e fim do take.'
FROM public.training_modules WHERE title = 'Módulo 2: Gravação de Falas e Performance' LIMIT 1;

-- Aulas do Módulo 3
INSERT INTO public.training_lessons (module_id, title, description, methodology_name, duration, display_order, video_url, content_markdown)
SELECT id, 'A Regra de Ouro (5-10s)', 'O tempo exato para cada take de produto.', '5-10 Rule', '5s', 0, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', '### Por que 5-10 segundos?\n- Facilita o corte na edição.\n- Mantém o Reels dinâmico.\n- Evita arquivos pesados desnecessários.'
FROM public.training_modules WHERE title = 'Módulo 3: Takes de Produto e B-Roll' LIMIT 1;

INSERT INTO public.training_lessons (module_id, title, description, methodology_name, duration, display_order, video_url, content_markdown)
SELECT id, 'Cenas de Detalhe (Macro Flow)', 'Valorizando o produto com movimentos de câmera.', 'Macro Flow', '10s', 1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', '### Movimentos Sugeridos\n- Push-in (Aproximação).\n- Slide lateral.\n- Revelação (Behind object).'
FROM public.training_modules WHERE title = 'Módulo 3: Takes de Produto e B-Roll' LIMIT 1;

-- Aulas do Módulo 4
INSERT INTO public.training_lessons (module_id, title, description, methodology_name, duration, display_order, video_url, content_markdown)
SELECT id, 'Checklist de Saída e Backup', 'Garantindo que o material está salvo antes de sair.', 'Safe Exit', '4 min', 0, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', '### Antes de sair do cliente\n- Verifique se gravou todos os takes do roteiro.\n- Confira o áudio da última fala.\n- Organize os cartões SD.'
FROM public.training_modules WHERE title = 'Módulo 4: Agilidade no Set e Entrega' LIMIT 1;

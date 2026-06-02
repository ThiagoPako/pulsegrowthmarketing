
-- Reset existing modules/lessons for the Pulse track
DELETE FROM training_modules WHERE track_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

-- Update track metadata
UPDATE training_tracks
SET title = 'Método Pulse de Captação',
    description = 'Sistema de gravação padronizado da agência Pulse: biblioteca visual de falas, takes e movimentos para vídeos consistentes, dinâmicos e profissionais.'
WHERE id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

-- Modules
INSERT INTO training_modules (id, track_id, title, description, display_order) VALUES
('11111111-0001-0000-0000-000000000001', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Conceito Principal', 'Estrutura base de todo vídeo Pulse: Gancho, Conteúdo e CTA, executados com Falas e Takes.', 0),
('11111111-0002-0000-0000-000000000002', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Biblioteca de Falas', 'Modelos de direção para pessoas falando em vídeo.', 1),
('11111111-0003-0000-0000-000000000003', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Biblioteca de Takes', 'Modelos de imagens de apoio utilizadas durante a narração.', 2),
('11111111-0004-0000-0000-000000000004', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Biblioteca de Movimentos', 'Movimentos de câmera para tornar os takes mais dinâmicos.', 3),
('11111111-0005-0000-0000-000000000005', 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Objetivo do Método', 'Como escolher fala, takes e movimentos para manter consistência visual e criatividade.', 4);

-- Conceito Principal
INSERT INTO training_lessons (module_id, title, description, thumbnail_url, duration, display_order) VALUES
('11111111-0001-0000-0000-000000000001', 'Gancho', 'Abertura que prende a atenção nos primeiros segundos.', 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&q=80', '60s', 0),
('11111111-0001-0000-0000-000000000001', 'Conteúdo', 'Desenvolvimento da mensagem central do vídeo.', 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800&q=80', '90s', 1),
('11111111-0001-0000-0000-000000000001', 'CTA', 'Chamada para ação final que conduz a próxima etapa.', 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&q=80', '45s', 2),
('11111111-0001-0000-0000-000000000001', 'Falas', 'Pessoa aparecendo falando diretamente para a câmera.', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&q=80', '60s', 3),
('11111111-0001-0000-0000-000000000001', 'Takes', 'Imagens de apoio utilizadas durante narrações e cortes.', 'https://images.unsplash.com/photo-1500916434205-0c77489c6cf7?w=800&q=80', '60s', 4);

-- Biblioteca de Falas
INSERT INTO training_lessons (module_id, title, description, thumbnail_url, duration, display_order) VALUES
('11111111-0002-0000-0000-000000000002', 'Caminhada', 'Pessoa andando enquanto fala, transmitindo dinamismo.', 'https://images.unsplash.com/photo-1483721310020-03333e577078?w=800&q=80', '60s', 0),
('11111111-0002-0000-0000-000000000002', 'Tour', 'Pessoa apresenta um ambiente enquanto fala.', 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80', '60s', 1),
('11111111-0002-0000-0000-000000000002', 'Apresentação', 'Pessoa parada olhando diretamente para a câmera.', 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&q=80', '60s', 2),
('11111111-0002-0000-0000-000000000002', 'Conversa', 'Interação natural entre duas pessoas.', 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=800&q=80', '60s', 3),
('11111111-0002-0000-0000-000000000002', 'Demonstração', 'Pessoa mostrando um produto ou serviço enquanto fala.', 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80', '60s', 4),
('11111111-0002-0000-0000-000000000002', 'Autoridade', 'Especialista falando de forma mais séria e técnica.', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=800&q=80', '60s', 5);

-- Biblioteca de Takes
INSERT INTO training_lessons (module_id, title, description, thumbnail_url, duration, display_order) VALUES
('11111111-0003-0000-0000-000000000003', 'Produto', 'Tomadas mostrando produtos em destaque.', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80', '30s', 0),
('11111111-0003-0000-0000-000000000003', 'Ambiente', 'Imagens que mostram o local de gravação.', 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=800&q=80', '30s', 1),
('11111111-0003-0000-0000-000000000003', 'Processo', 'Mostra a execução do serviço passo a passo.', 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800&q=80', '30s', 2),
('11111111-0003-0000-0000-000000000003', 'Detalhes', 'Closes e acabamentos do produto ou ambiente.', 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80', '30s', 3),
('11111111-0003-0000-0000-000000000003', 'Interação', 'Pessoas utilizando produtos ou serviços.', 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80', '30s', 4),
('11111111-0003-0000-0000-000000000003', 'Resultado', 'Entrega final, transformação ou antes e depois.', 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&q=80', '30s', 5),
('11111111-0003-0000-0000-000000000003', 'Prova Social', 'Clientes, depoimentos e movimentação real.', 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80', '30s', 6);

-- Biblioteca de Movimentos
INSERT INTO training_lessons (module_id, title, description, thumbnail_url, duration, display_order) VALUES
('11111111-0004-0000-0000-000000000004', 'Aproximação', 'Câmera se aproxima do sujeito, criando intimidade ou foco.', 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&q=80', '20s', 0),
('11111111-0004-0000-0000-000000000004', 'Afastamento', 'Câmera se afasta, revelando contexto e amplitude.', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=800&q=80', '20s', 1),
('11111111-0004-0000-0000-000000000004', 'Movimento Lateral', 'Deslocamento lateral suave para mostrar variações de cena.', 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&q=80', '20s', 2),
('11111111-0004-0000-0000-000000000004', 'Acompanhamento', 'Câmera segue o sujeito mantendo o enquadramento.', 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&q=80', '20s', 3),
('11111111-0004-0000-0000-000000000004', 'Revelação', 'Movimento que descobre algo gradualmente no quadro.', 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=800&q=80', '20s', 4),
('11111111-0004-0000-0000-000000000004', 'Movimento Orbital', 'Câmera gira ao redor do sujeito mantendo-o centralizado.', 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=800&q=80', '20s', 5);

-- Objetivo do Método
INSERT INTO training_lessons (module_id, title, description, thumbnail_url, duration, display_order) VALUES
('11111111-0005-0000-0000-000000000005', 'Como será a fala', 'Definir o modelo de fala adequado ao roteiro.', 'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=800&q=80', '45s', 0),
('11111111-0005-0000-0000-000000000005', 'Quais takes serão gravados', 'Planejar os tipos de takes que apoiarão a narração.', 'https://images.unsplash.com/photo-1492724441997-5dc865305da7?w=800&q=80', '45s', 1),
('11111111-0005-0000-0000-000000000005', 'Quais movimentos de câmera', 'Selecionar os movimentos que darão dinamismo ao vídeo.', 'https://images.unsplash.com/photo-1496115898378-39bc4cea24a3?w=800&q=80', '45s', 2),
('11111111-0005-0000-0000-000000000005', 'Consistência visual Pulse', 'Aplicar o método para manter aparência nova e profissional.', 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80', '45s', 3);

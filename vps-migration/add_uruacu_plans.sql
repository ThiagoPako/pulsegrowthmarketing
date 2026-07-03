-- ═══════════════════════════════════════════════════════════════
-- Adiciona coluna city em plans + insere planos da apresentação Uruaçu
-- Idempotente: pode rodar múltiplas vezes.
-- ═══════════════════════════════════════════════════════════════

-- 1) Coluna city (default 'minacu' → planos antigos ficam em Minaçu)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='plans' AND column_name='city'
  ) THEN
    ALTER TABLE public.plans ADD COLUMN city city_code NOT NULL DEFAULT 'minacu';
    CREATE INDEX IF NOT EXISTS idx_plans_city ON public.plans (city);
  END IF;
END $$;

-- 2) Insere os 4 planos de Uruaçu (só se ainda não existirem)
INSERT INTO public.plans (name, description, reels_qty, creatives_qty, stories_qty, arts_qty, recording_sessions, price, periodicity, status, city)
SELECT * FROM (VALUES
  ('Pulse Starter',
   'Base profissional: 4 reels, 2 artes, tráfego Meta Ads, edição de vídeo e portal do cliente.',
   4, 2, 0, 2, 4, 2400, 'mensal', 'ativo', 'uruacu'::city_code),

  ('Pulse Boost',
   'Plano recomendado: 6 reels, 20 stories, 4 criativos, 4 artes, social media dedicado, Google + Meta Ads, reformulação de perfil.',
   6, 4, 20, 4, 4, 2900, 'mensal', 'ativo', 'uruacu'::city_code),

  ('Pulse Premium',
   'Autoridade + vendas: 8 reels, 20 stories, 6 artes, CRM integrado, campanhas comerciais e treinamento de vendas.',
   8, 0, 20, 6, 4, 4200, 'mensal', 'ativo', 'uruacu'::city_code),

  ('Pulse Elite',
   'Dominância de mercado: 12 reels, 8 artes, Google + Meta Ads premium, CRM avançado, WhatsApp com time de vendas, influenciadores.',
   12, 0, 20, 8, 4, 5850, 'mensal', 'ativo', 'uruacu'::city_code)
) AS v(name, description, reels_qty, creatives_qty, stories_qty, arts_qty, recording_sessions, price, periodicity, status, city)
WHERE NOT EXISTS (
  SELECT 1 FROM public.plans p WHERE p.city = 'uruacu' AND p.name = v.name
);

-- Verificação
SELECT city, name, price, status FROM public.plans ORDER BY city, price;

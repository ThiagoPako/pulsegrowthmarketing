-- ============================================================
-- CLONE PARA URUAÇU — NÃO ALTERA NENHUM DADO DE MINAÇU
-- ============================================================
-- Este script é 100% aditivo:
--   • NÃO faz UPDATE em linhas existentes
--   • NÃO faz DELETE
--   • NÃO altera tipos, defaults, NOT NULL nem CHECK constraints
--   • Apenas garante que a infra multi-cidade está pronta para
--     receber dados novos com city='uruacu', deixando Minaçu intacta.
--
-- Idempotente — pode rodar quantas vezes quiser.
-- Rodar com: sudo -u postgres psql -d pulse_db -f clone_uruacu.sql
-- ============================================================

BEGIN;

-- 1) Enum city_code (se ainda não existir)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'city_code') THEN
    CREATE TYPE city_code AS ENUM ('minacu','uruacu');
  END IF;
END $$;

-- 2) Garante o valor 'uruacu' no enum (caso o enum exista sem ele)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'city_code' AND e.enumlabel = 'uruacu'
  ) THEN
    ALTER TYPE city_code ADD VALUE 'uruacu';
  END IF;
END $$;

-- 3) Tabela user_cities — mapeia equipe por cidade
CREATE TABLE IF NOT EXISTS public.user_cities (
  user_id    uuid NOT NULL,
  city       text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, city)
);
CREATE INDEX IF NOT EXISTS idx_user_cities_user ON public.user_cities (user_id);
CREATE INDEX IF NOT EXISTS idx_user_cities_city ON public.user_cities (city);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_cities_primary
  ON public.user_cities (user_id) WHERE is_primary;

-- 4) Backfill SEGURO de acessos (somente INSERTs, ON CONFLICT DO NOTHING)
--    a) Todos os profiles ganham acesso primário a 'minacu' (sem alterar quem já existe)
INSERT INTO public.user_cities (user_id, city, is_primary)
SELECT id, 'minacu', true FROM public.profiles
ON CONFLICT (user_id, city) DO NOTHING;

--    b) Admins ganham acesso adicional a 'uruacu' (somente leitura/escrita na nova cidade)
INSERT INTO public.user_cities (user_id, city, is_primary)
SELECT ur.user_id, 'uruacu', false
FROM public.user_roles ur WHERE ur.role = 'admin'
ON CONFLICT (user_id, city) DO NOTHING;

-- 5) Helper de checagem (não modifica nada)
CREATE OR REPLACE FUNCTION public.user_has_city(_user uuid, _city text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_cities
    WHERE user_id = _user AND city = _city
  )
$$;

-- 6) Verificação final — apenas SELECTs, nada é alterado
--    (Uruaçu deve aparecer com 0 registros — clone limpo)
SELECT 'clients'    AS tabela, COALESCE(city::text,'<null>') AS city, COUNT(*) FROM public.clients    GROUP BY city
UNION ALL
SELECT 'recordings',           COALESCE(city::text,'<null>'),            COUNT(*) FROM public.recordings GROUP BY city
UNION ALL
SELECT 'user_cities',          city,                                     COUNT(*) FROM public.user_cities GROUP BY city
ORDER BY tabela, city;

COMMIT;

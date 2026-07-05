-- ============================================================
-- Adiciona o tipo 'evento' ao CHECK constraint de campaigns
-- Rodar em cada banco (pulse_minacu, pulse_uruacu)
-- Idempotente: pode rodar múltiplas vezes sem erro.
-- ============================================================

DO $$
BEGIN
  -- Remove qualquer CHECK antigo em type
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.campaigns'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%type%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.campaigns DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'public.campaigns'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%type%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_type_check
  CHECK (type IN ('institucional','promocional','sazonal','lancamento','responsabilidade_social','evento'));

-- Adiciona coluna para marcar quando um gestor de projetos (ou qualquer usuário) iniciou o expediente.
-- Executar na VPS: psql -h 127.0.0.1 -U pulse_user -d pulse_db -f vps-migration/add_working_since.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS working_since timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_working_since ON public.profiles (working_since) WHERE working_since IS NOT NULL;

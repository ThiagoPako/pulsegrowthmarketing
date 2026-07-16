-- Corrige solicitações do módulo Copy na VPS.
-- Execute no PostgreSQL local da VPS com o usuário dono do banco/tabelas.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS script_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  notes TEXT,
  content_format TEXT NOT NULL DEFAULT 'reels',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','cancelled')),
  priority TEXT NOT NULL DEFAULT 'alta' CHECK (priority IN ('alta','normal')),
  requested_by UUID,
  requested_by_name TEXT,
  fulfilled_script_id UUID REFERENCES scripts(id) ON DELETE SET NULL,
  fulfilled_at TIMESTAMPTZ,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE script_requests
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT 'reels',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'alta',
  ADD COLUMN IF NOT EXISTS requested_by UUID,
  ADD COLUMN IF NOT EXISTS requested_by_name TEXT,
  ADD COLUMN IF NOT EXISTS fulfilled_script_id UUID REFERENCES scripts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_script_requests_status ON script_requests(status);
CREATE INDEX IF NOT EXISTS idx_script_requests_client_id ON script_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_script_requests_created_at ON script_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_script_requests_city ON script_requests(city);
-- ============================================================
-- MULTI-CITY MIGRATION — Minaçu (atual) + Uruaçu (nova)
-- Execução única, idempotente. Rode no Postgres da VPS (pulse_db).
-- ============================================================

BEGIN;

-- 1) Enum city_code
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'city_code') THEN
    CREATE TYPE city_code AS ENUM ('minacu', 'uruacu');
  END IF;
END $$;

-- 2) Helper: adiciona coluna city com default 'minacu' (NOT NULL) numa tabela
CREATE OR REPLACE FUNCTION public._add_city_column(tbl text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl)
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name=tbl AND column_name='city') THEN
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN city city_code NOT NULL DEFAULT ''minacu''', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_city ON public.%I (city)', tbl, tbl);
  END IF;
END $$;

-- 3) Aplica city em todas as tabelas operacionais
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'clients','recordings','kanban_tasks','scripts','active_recordings',
    'content_tasks','task_history','task_comments',
    'design_tasks','design_task_history','delivery_records',
    'revenues','expenses','financial_contracts','financial_activity_log',
    'financial_chat_messages','cash_reserve_movements','billing_messages',
    'social_media_deliveries','social_accounts','integration_logs',
    'automation_flows','automation_logs','api_integrations','api_integration_logs',
    'onboarding_tasks',
    'client_portal_contents','client_portal_comments','client_portal_notifications',
    'flyer_items','flyer_templates',
    'endomarketing_clientes','endomarketing_agendamentos','endomarketing_profissionais',
    'endomarketing_logs','endomarketing_packages','endomarketing_partner_tasks',
    'client_endomarketing_contracts',
    'traffic_campaigns','whatsapp_messages','whatsapp_confirmations',
    'recording_wait_logs','portal_videos','portal_video_views',
    'commercial_proposals','proposal_comments','event_recordings',
    'client_testimonials','proposal_checklist_items',
    'fieldwork_activities','goals','notifications',
    'company_settings','whatsapp_config','payment_config',
    'crm_leads','crm_notes',
    'mural_desabafo','login_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    PERFORM public._add_city_column(t);
  END LOOP;
END $$;

-- 4) Tabela user_cities (equipe compartilhada entre cidades)
CREATE TABLE IF NOT EXISTS public.user_cities (
  user_id    uuid NOT NULL,
  city       city_code NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, city)
);
CREATE INDEX IF NOT EXISTS idx_user_cities_user ON public.user_cities (user_id);
CREATE INDEX IF NOT EXISTS idx_user_cities_city ON public.user_cities (city);

-- 5) Garante 1 única primary por usuário (parcial unique)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_cities_primary
  ON public.user_cities (user_id) WHERE is_primary;

-- 6) Backfill: todo usuário existente em 'minacu' como primary
INSERT INTO public.user_cities (user_id, city, is_primary)
SELECT id, 'minacu'::city_code, true FROM public.profiles
ON CONFLICT (user_id, city) DO NOTHING;

-- 7) Admin master também recebe acesso a Uruaçu (descoberto via user_roles=admin)
INSERT INTO public.user_cities (user_id, city, is_primary)
SELECT ur.user_id, 'uruacu'::city_code, false
FROM public.user_roles ur WHERE ur.role = 'admin'
ON CONFLICT (user_id, city) DO NOTHING;

-- 8) Helper consultável pelo backend
CREATE OR REPLACE FUNCTION public.user_has_city(_user uuid, _city city_code)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_cities WHERE user_id = _user AND city = _city)
$$;

COMMIT;

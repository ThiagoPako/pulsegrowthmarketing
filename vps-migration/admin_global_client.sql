-- ============================================================
-- CLIENTE ADMIN GLOBAL (interno da agência)
-- Idempotente. A API também aplica isso no boot (ensureGlobalClientSupport).
-- ============================================================

BEGIN;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_admin_client BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.clients ALTER COLUMN city DROP NOT NULL;

-- Cliente admin nunca pertence a uma praça: city = NULL => visível em todas.
CREATE OR REPLACE FUNCTION public.apply_admin_client_city() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.is_admin_client THEN NEW.city := NULL; END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_admin_client_city ON public.clients;
CREATE TRIGGER trg_admin_client_city BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.apply_admin_client_city();

-- Demandas de um cliente admin também ficam globais.
CREATE OR REPLACE FUNCTION public.apply_global_client_city() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE v_global boolean;
BEGIN
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;
  SELECT c.is_admin_client INTO v_global
  FROM public.clients c WHERE c.id::text = NEW.client_id::text;
  IF COALESCE(v_global, false) THEN NEW.city := NULL; END IF;
  RETURN NEW;
END $fn$;

DO $do$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c1.table_name AS name
    FROM information_schema.columns c1
    JOIN information_schema.columns c2
      ON c2.table_schema = c1.table_schema
     AND c2.table_name = c1.table_name
     AND c2.column_name = 'client_id'
    JOIN information_schema.tables tb
      ON tb.table_schema = c1.table_schema
     AND tb.table_name = c1.table_name
     AND tb.table_type = 'BASE TABLE'
    WHERE c1.table_schema = 'public' AND c1.column_name = 'city'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN city DROP NOT NULL', t.name);
    EXCEPTION WHEN others THEN NULL;
    END;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_global_client_city ON public.%I', t.name);
    EXECUTE format(
      'CREATE TRIGGER trg_global_client_city BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.apply_global_client_city()',
      t.name
    );
  END LOOP;
END $do$;

COMMIT;

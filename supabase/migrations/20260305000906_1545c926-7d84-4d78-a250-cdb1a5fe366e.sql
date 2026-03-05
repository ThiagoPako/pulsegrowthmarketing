ALTER TABLE public.scripts
  ADD COLUMN is_endomarketing boolean NOT NULL DEFAULT false,
  ADD COLUMN endo_client_id uuid NULL,
  ADD COLUMN scheduled_date date NULL;

-- Add foreign key to endomarketing_clientes
ALTER TABLE public.scripts
  ADD CONSTRAINT scripts_endo_client_id_fkey
  FOREIGN KEY (endo_client_id) REFERENCES public.endomarketing_clientes(id) ON DELETE SET NULL;
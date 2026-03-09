ALTER TABLE public.clients 
  ADD COLUMN IF NOT EXISTS client_login text DEFAULT '',
  ADD COLUMN IF NOT EXISTS client_password text DEFAULT '',
  ADD COLUMN IF NOT EXISTS drive_link text DEFAULT '',
  ADD COLUMN IF NOT EXISTS drive_fotos text DEFAULT '',
  ADD COLUMN IF NOT EXISTS drive_identidade_visual text DEFAULT '';
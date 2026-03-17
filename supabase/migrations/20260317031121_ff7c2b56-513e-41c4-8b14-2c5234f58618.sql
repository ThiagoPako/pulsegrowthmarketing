
-- Add hashed password column to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_password_hash text;

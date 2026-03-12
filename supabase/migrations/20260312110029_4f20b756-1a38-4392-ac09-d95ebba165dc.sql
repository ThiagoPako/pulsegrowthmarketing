
-- Add client_priority column to scripts table for client-set priority from portal
ALTER TABLE public.scripts ADD COLUMN IF NOT EXISTS client_priority text NOT NULL DEFAULT 'normal';

-- Allow anon to update scripts (for client portal priority marking)
CREATE POLICY "anon_update_scripts_priority" ON public.scripts
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

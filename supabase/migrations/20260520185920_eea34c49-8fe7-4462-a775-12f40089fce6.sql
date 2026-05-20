ALTER TABLE public.crm_leads 
ADD COLUMN IF NOT EXISTS meeting_date DATE,
ADD COLUMN IF NOT EXISTS meeting_time TIME,
ADD COLUMN IF NOT EXISTS meeting_link TEXT;

-- Indexar por data de reunião para performance no calendário
CREATE INDEX IF NOT EXISTS idx_crm_leads_meeting_date ON public.crm_leads(meeting_date);
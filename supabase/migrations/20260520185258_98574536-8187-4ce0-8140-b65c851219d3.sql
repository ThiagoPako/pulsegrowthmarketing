-- Garantir que a função de timestamp existe
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Criar enums
DO $$ BEGIN
    CREATE TYPE crm_lead_status AS ENUM ('lead', 'contacted', 'meeting', 'contracted', 'recovery_followup_1', 'recovery_followup_2');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE crm_lead_tag AS ENUM ('hot', 'cold');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Criar tabela de leads
CREATE TABLE IF NOT EXISTS public.crm_leads (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    phone TEXT,
    contract_value NUMERIC(15, 2) DEFAULT 0,
    status crm_lead_status NOT NULL DEFAULT 'lead',
    tag crm_lead_tag,
    last_interaction TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) NOT NULL DEFAULT auth.uid()
);

-- Criar tabela de notas
CREATE TABLE IF NOT EXISTS public.crm_notes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    stage crm_lead_status NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) NOT NULL DEFAULT auth.uid()
);

-- Habilitar RLS
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
DO $$ BEGIN
    CREATE POLICY "Users can manage their own leads" ON public.crm_leads
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can manage their own lead notes" ON public.crm_notes
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_crm_leads_updated_at ON public.crm_leads;
CREATE TRIGGER update_crm_leads_updated_at
BEFORE UPDATE ON public.crm_leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
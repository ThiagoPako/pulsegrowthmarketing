
-- Create plans table
CREATE TABLE public.plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reels_qty INTEGER NOT NULL DEFAULT 0,
  creatives_qty INTEGER NOT NULL DEFAULT 0,
  stories_qty INTEGER NOT NULL DEFAULT 0,
  arts_qty INTEGER NOT NULL DEFAULT 0,
  recording_sessions INTEGER NOT NULL DEFAULT 0,
  recording_hours NUMERIC NOT NULL DEFAULT 0,
  extra_content_allowed INTEGER NOT NULL DEFAULT 0,
  price NUMERIC NOT NULL DEFAULT 0,
  periodicity TEXT NOT NULL DEFAULT 'mensal',
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add plan fields to clients table
ALTER TABLE public.clients 
  ADD COLUMN plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  ADD COLUMN contract_start_date DATE,
  ADD COLUMN auto_renewal BOOLEAN NOT NULL DEFAULT false;

-- Create delivery_records table
CREATE TABLE public.delivery_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID REFERENCES public.recordings(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  videomaker_id UUID NOT NULL REFERENCES public.profiles(id),
  date DATE NOT NULL,
  reels_produced INTEGER NOT NULL DEFAULT 0,
  creatives_produced INTEGER NOT NULL DEFAULT 0,
  stories_produced INTEGER NOT NULL DEFAULT 0,
  arts_produced INTEGER NOT NULL DEFAULT 0,
  extras_produced INTEGER NOT NULL DEFAULT 0,
  videos_recorded INTEGER NOT NULL DEFAULT 0,
  observations TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'realizada',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_records ENABLE ROW LEVEL SECURITY;

-- Plans: everyone can view, admin can manage
CREATE POLICY "Authenticated can view plans" ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage plans" ON public.plans FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Delivery records: everyone can view, admin and videomaker can manage
CREATE POLICY "Authenticated can view delivery records" ON public.delivery_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage delivery records" ON public.delivery_records FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Videomaker manage own delivery records" ON public.delivery_records FOR ALL TO authenticated USING (videomaker_id = auth.uid()) WITH CHECK (videomaker_id = auth.uid());

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.plans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_records;

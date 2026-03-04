
-- 1. Create enum for app roles
CREATE TYPE public.app_role AS ENUM ('admin', 'videomaker', 'social_media', 'editor', 'endomarketing');

-- 2. Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'editor',
  avatar_url TEXT,
  display_name TEXT,
  job_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. User roles table (separate for RBAC)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. Function to get user role from profiles (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = _user_id
$$;

-- 6. RLS policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 7. RLS policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 8. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'editor')
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'editor')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. Endomarketing clients table
CREATE TABLE public.endomarketing_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT, -- reference to existing client system
  company_name TEXT NOT NULL,
  responsible_person TEXT,
  phone TEXT,
  color TEXT DEFAULT '217 91% 60%',
  active BOOLEAN NOT NULL DEFAULT true,
  stories_per_week INTEGER NOT NULL DEFAULT 5,
  presence_days_per_week INTEGER NOT NULL DEFAULT 3,
  selected_days TEXT[] NOT NULL DEFAULT '{"segunda","terca","quarta","quinta","sexta"}',
  session_duration INTEGER NOT NULL DEFAULT 60, -- minutes: 30, 60, 90
  execution_type TEXT NOT NULL DEFAULT 'sozinho', -- 'sozinho' | 'com_videomaker'
  plan_type TEXT NOT NULL DEFAULT 'presencial_recorrente', -- 'presencial_recorrente' | 'gravacao_concentrada'
  total_contracted_hours NUMERIC(5,1) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.endomarketing_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view endo clients" ON public.endomarketing_clientes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and endo can manage endo clients" ON public.endomarketing_clientes
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'endomarketing')
  );

-- 10. Endomarketing professionals (availability config)
CREATE TABLE public.endomarketing_profissionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  max_hours_per_day NUMERIC(3,1) NOT NULL DEFAULT 6,
  available_days TEXT[] NOT NULL DEFAULT '{"segunda","terca","quarta","quinta","sexta"}',
  start_time TEXT NOT NULL DEFAULT '08:00',
  end_time TEXT NOT NULL DEFAULT '18:00',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.endomarketing_profissionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view endo pros" ON public.endomarketing_profissionais
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage endo pros" ON public.endomarketing_profissionais
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 11. Endomarketing scheduling
CREATE TABLE public.endomarketing_agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.endomarketing_clientes(id) ON DELETE CASCADE NOT NULL,
  profissional_id UUID REFERENCES public.endomarketing_profissionais(id) NOT NULL,
  videomaker_id UUID REFERENCES auth.users(id),
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 60, -- minutes
  status TEXT NOT NULL DEFAULT 'agendado', -- 'agendado' | 'concluido' | 'cancelado' | 'remarcado'
  cancellation_reason TEXT,
  checklist JSONB DEFAULT '{"stories":false,"reels":false,"institucional":false,"estrategico":false}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.endomarketing_agendamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view endo schedules" ON public.endomarketing_agendamentos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and endo can manage schedules" ON public.endomarketing_agendamentos
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'endomarketing')
  );

-- 12. Endomarketing logs/history
CREATE TABLE public.endomarketing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID REFERENCES public.endomarketing_agendamentos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.endomarketing_clientes(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'criado' | 'concluido' | 'cancelado' | 'remarcado'
  details JSONB,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.endomarketing_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view endo logs" ON public.endomarketing_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and endo can insert logs" ON public.endomarketing_logs
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'endomarketing')
  );

-- 13. Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.endomarketing_agendamentos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.endomarketing_clientes;

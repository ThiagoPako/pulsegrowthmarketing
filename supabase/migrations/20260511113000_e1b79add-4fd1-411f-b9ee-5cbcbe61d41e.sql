-- Add monthly_salary to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(10,2) DEFAULT 0;

-- Comment for documentation
COMMENT ON COLUMN public.profiles.monthly_salary IS 'Salário mensal fixo do colaborador para fins de cálculo de custo de produção.';
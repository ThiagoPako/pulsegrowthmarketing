
-- Add confirmation_status column to recordings
ALTER TABLE public.recordings ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'pendente';

-- Add new message templates to whatsapp_config
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS msg_confirmation text NOT NULL DEFAULT 'Olá, {nome_cliente}!

Aqui é a equipe da Pulse Growth Marketing 🚀

Passando para confirmar sua gravação agendada.

📅 Data: {data_gravacao}
⏰ Horário: {hora_gravacao}
🎥 Videomaker: {videomaker}

Por favor responda com uma das opções abaixo:

1️⃣ Confirmar gravação
2️⃣ Cancelar gravação

Assim conseguimos organizar nossa agenda da melhor forma para você.';

ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS msg_confirmation_confirmed text NOT NULL DEFAULT 'Perfeito, {nome_cliente}!

Sua gravação está confirmada para:

📅 {data_gravacao}
⏰ {hora_gravacao}

Nossa equipe estará pronta para criar conteúdos incríveis para sua marca 🚀

Até breve!

Equipe Pulse Growth Marketing';

ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS msg_confirmation_cancelled text NOT NULL DEFAULT 'Entendido, {nome_cliente}.

Sua gravação foi marcada como cancelada.

Se surgir uma nova vaga na agenda entraremos em contato com você.

Equipe Pulse Growth Marketing';

ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS msg_backup_invite text NOT NULL DEFAULT 'Olá, {nome_cliente}!

Surgiu uma vaga extra de gravação na agenda da Pulse 🚀

📅 Data: {data_gravacao}
⏰ Horário: {hora_gravacao}

Gostaria de aproveitar essa oportunidade para gravar conteúdos extras?

Responda:

1️⃣ Quero aproveitar
2️⃣ Não posso dessa vez';

ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS msg_backup_confirmed text NOT NULL DEFAULT 'Perfeito, {nome_cliente}!

Sua gravação extra foi confirmada.

Nossa equipe estará indo até você no horário combinado.

Equipe Pulse Growth Marketing';

ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS auto_confirmation boolean NOT NULL DEFAULT true;

-- Table to track pending confirmations and backup invites
CREATE TABLE IF NOT EXISTS public.whatsapp_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  type text NOT NULL DEFAULT 'confirmation', -- 'confirmation' or 'backup_invite'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled', 'expired'
  sent_at timestamptz,
  responded_at timestamptz,
  response_message text,
  backup_client_ids text[] NOT NULL DEFAULT '{}', -- ordered list of backup candidates
  backup_index integer NOT NULL DEFAULT 0, -- current index in backup_client_ids
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view confirmations" ON public.whatsapp_confirmations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage confirmations" ON public.whatsapp_confirmations FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can insert confirmations" ON public.whatsapp_confirmations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update confirmations" ON public.whatsapp_confirmations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

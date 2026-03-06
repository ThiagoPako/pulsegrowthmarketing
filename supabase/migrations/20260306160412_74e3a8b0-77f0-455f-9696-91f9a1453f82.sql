
-- Add deadline and priority columns to content_tasks
ALTER TABLE public.content_tasks 
  ADD COLUMN IF NOT EXISTS editing_priority boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS immediate_alteration boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_deadline timestamp with time zone,
  ADD COLUMN IF NOT EXISTS alteration_deadline timestamp with time zone,
  ADD COLUMN IF NOT EXISTS approval_deadline timestamp with time zone;

-- Add approval expired message template to whatsapp_config
ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS msg_approval_expired text NOT NULL DEFAULT 'Olá, {nome_cliente}! 😊

Para manter o fluxo de conteúdos em dia e não atrasar suas publicações, o vídeo "{titulo}" foi encaminhado para agendamento pela nossa equipe.

Pode ficar tranquilo(a)! Foi feita uma revisão interna cuidadosa no vídeo antes de seguir para a postagem. 👍

Se precisar de algum ajuste, é só nos avisar!

Equipe Pulse Growth Marketing 🚀';

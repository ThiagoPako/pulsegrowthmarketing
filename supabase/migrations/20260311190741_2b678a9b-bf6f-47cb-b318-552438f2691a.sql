ALTER TABLE public.whatsapp_config 
ADD COLUMN IF NOT EXISTS auto_task_editing boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS msg_task_editing text NOT NULL DEFAULT 'Olá, {nome_cliente}! 🎬

Hoje gravamos o vídeo *"{titulo}"* e ele já está com o nosso time de edição! ✂️

Assim que estiver pronto, enviaremos o link aqui para sua aprovação. 📲

Agradecemos pela confiança!

Equipe Pulse Growth Marketing 🚀',
ADD COLUMN IF NOT EXISTS auto_task_approved boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS msg_task_approved text NOT NULL DEFAULT 'Olá, {nome_cliente}! ✅

Seu vídeo *"{titulo}"* foi aprovado com sucesso e já está sendo encaminhado para agendamento! 📅

Obrigado pela confiança!

Equipe Pulse Growth Marketing 🚀',
ADD COLUMN IF NOT EXISTS auto_approval_expired boolean NOT NULL DEFAULT true;